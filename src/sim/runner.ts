import { compileProject, CompileOutput, Diagnostic } from './c/compiler';
import { CError } from './c/lexer';
import { BUILTINS } from './c/builtins';
import { RuntimeError, StopReason, VM } from './c/vm';
import { Board } from './board/machine';
import { MK, typeName } from './c/types';

export type RunState = 'idle' | 'running' | 'paused' | 'halted' | 'error';

export interface CompileResult {
  ok: boolean;
  diagnostics: Diagnostic[];
  out?: CompileOutput;
  ms: number;
}

export function compile(files: Record<string, string>): CompileResult {
  const t0 = performance.now();
  try {
    const out = compileProject(files);
    return { ok: true, diagnostics: out.warnings, out, ms: performance.now() - t0 };
  } catch (e) {
    if (e instanceof CError) {
      return { ok: false, diagnostics: [{ file: e.file, line: e.line, col: e.col, msg: e.message, severity: 'error' }], ms: performance.now() - t0 };
    }
    console.error(e);
    return { ok: false, diagnostics: [{ file: '', line: 0, msg: 'Internal compiler error: ' + (e as Error).message, severity: 'error' }], ms: performance.now() - t0 };
  }
}

const IRQ_NAMES: Record<number, string> = {
  [-1]: 'SysTick_Handler', 1: 'TIMER0_IRQHandler', 2: 'TIMER1_IRQHandler', 3: 'TIMER2_IRQHandler', 4: 'TIMER3_IRQHandler',
  5: 'UART0_IRQHandler', 6: 'UART1_IRQHandler', 7: 'UART2_IRQHandler', 8: 'UART3_IRQHandler', 9: 'PWM1_IRQHandler',
  18: 'EINT0_IRQHandler', 19: 'EINT1_IRQHandler', 20: 'EINT2_IRQHandler', 21: 'EINT3_IRQHandler', 22: 'ADC_IRQHandler',
  29: 'RIT_IRQHandler',
};

/** Owns one firmware image running on one board. */
export class Session {
  vm: VM;
  board: Board;
  out: CompileOutput;
  state: RunState = 'paused';
  error: RuntimeError | null = null;
  lastStop: StopReason | null = null;
  stdout = '';

  constructor(out: CompileOutput, board: Board) {
    this.out = out;
    this.board = board;
    board.reset();
    this.vm = new VM({
      code: out.code, consts: out.consts, funcs: out.funcs, lines: out.lines, builtins: BUILTINS.map(b => b.impl),
      rom: out.rom, ramInit: out.ramInit, globalsEnd: out.globalsEnd, bus: board, entry: out.entry,
    });
    (this.vm as any).host = board;
    board.vm = this.vm;
    board.baseOps = 0; board.baseNs = 0;
    this.vm.irqPending = board.pendingIrq;
    this.vm.onIrqEnter = board.onIrqEnter;
    for (const [irq, name] of Object.entries(IRQ_NAMES)) {
      const fi = out.funcIndex.get(name);
      if (fi !== undefined) this.vm.irqHandlers.set(Number(irq), fi);
    }
    this.vm.stdout = (s) => { this.stdout += s; if (this.stdout.length > 20000) this.stdout = this.stdout.slice(-16000); board.onStdout(s); };
  }

  /**
   * Execute for `ns` of simulated time (or until a stop). Returns the stop reason.
   * `deadline` is a performance.now() timestamp after which we yield to keep the UI smooth.
   */
  advance(ns: number, deadline = Infinity): StopReason {
    const vm = this.vm;
    if (vm.halted) return vm.error ? 'error' : 'halt';
    const board = this.board;
    const target = board.ns() + ns;
    const nsPerOp = 1e9 / board.opsRate;
    let reason: StopReason = 'budget';
    let iter = 0;
    while (board.ns() < target) {
      const remain = target - board.ns();
      const next = board.nextEventNs();
      const span = Math.min(remain, Math.max(next, nsPerOp * 50));
      const budget = Math.max(1, Math.ceil(span / nsPerOp));
      reason = vm.run(Math.min(budget, 200_000));
      if (reason !== 'budget') break;
      board.sync();
      if ((++iter & 7) === 0 && performance.now() > deadline) break;
    }
    if (reason === 'error') { this.error = vm.error; this.state = 'error'; }
    else if (reason === 'halt') this.state = 'halted';
    this.lastStop = reason;
    return reason;
  }

  /** Run a fixed number of ops (used by tests and the headless runner). */
  runOps(n: number): StopReason {
    let left = n;
    let r: StopReason = 'budget';
    while (left > 0) {
      const chunk = Math.min(left, 5000);
      r = this.vm.run(chunk);
      this.board.sync();
      left -= chunk;
      if (r !== 'budget') break;
    }
    if (r === 'error') { this.error = this.vm.error; this.state = 'error'; }
    if (r === 'halt') this.state = 'halted';
    return r;
  }

  location() { return this.vm.loc(); }

  /** Variables visible in the current frame plus globals, for the watch panel. */
  inspect(): { scope: 'local' | 'global'; name: string; type: string; value: string }[] {
    const res: { scope: 'local' | 'global'; name: string; type: string; value: string }[] = [];
    for (const g of this.out.globals) {
      if (g.name.includes('.')) continue;
      if (g.name === 'SystemCoreClock') continue;
      res.push({ scope: 'global', name: g.name, type: typeName(g.type), value: this.formatValue(g.addr, g.type) });
    }
    return res;
  }

  formatValue(addr: number, type: any, depth = 0): string {
    const vm = this.vm;
    try {
      if (type.k === 'arr') {
        const n = Math.min(type.len ?? 0, 16);
        const es = elemSize(type.of);
        if (type.of.k === 'int' && type.of.size === 1) {
          let s = '';
          for (let i = 0; i < (type.len ?? 0) && i < 32; i++) {
            const c = vm.read(addr + i, MK.U8);
            if (c === 0) break;
            s += c >= 32 && c < 127 ? String.fromCharCode(c) : `\\x${c.toString(16).padStart(2, '0')}`;
          }
          return JSON.stringify(s);
        }
        const items: string[] = [];
        for (let i = 0; i < n; i++) items.push(this.formatValue(addr + i * es, type.of, depth + 1));
        return `{${items.join(', ')}${(type.len ?? 0) > 16 ? ', …' : ''}}`;
      }
      if (type.k === 'struct') return depth > 0 ? '{…}' : `{${(type.fields ?? []).slice(0, 6).map((f: any) => `${f.name}: ${this.formatValue(addr + f.offset, f.type, depth + 1)}`).join(', ')}}`;
      if (type.k === 'float') return String(+vm.read(addr, type.size === 4 ? MK.F32 : MK.F64).toPrecision(7));
      if (type.k === 'ptr') return '0x' + (vm.read(addr, MK.U32) >>> 0).toString(16).toUpperCase().padStart(8, '0');
      if (type.k === 'int' || type.k === 'enum') {
        const mk = type.k === 'enum' ? MK.I32 : type.size === 1 ? (type.signed ? MK.I8 : MK.U8) : type.size === 2 ? (type.signed ? MK.I16 : MK.U16) : type.size === 8 ? MK.F64 : (type.signed ? MK.I32 : MK.U32);
        const v = vm.read(addr, mk);
        const hex = (v >>> 0).toString(16).toUpperCase();
        return depth > 0 ? String(v) : `${v}  (0x${hex})`;
      }
    } catch { return '?'; }
    return '?';
  }

  /** Locals of the current frame. */
  locals(): { name: string; type: string; value: string }[] {
    return [];
  }
}

function elemSize(t: any): number {
  if (t.k === 'int') return t.size;
  if (t.k === 'float') return t.size;
  if (t.k === 'arr') return t.len * elemSize(t.of);
  if (t.k === 'struct') return t.size;
  return 4;
}
