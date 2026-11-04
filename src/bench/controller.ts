import { compile, Session } from '../sim/runner';
import type { Diagnostic } from '../sim/c/compiler';
import { Board, BoardSnapshot } from '../sim/board/machine';
import { Wiring, emptyWiring } from '../sim/board/wiring';
import { assemble, AsmResult } from '../sim/arm/assembler';
import { ArmCpu } from '../sim/arm/cpu';
import type { Lang } from '../content/experiments';
import { audio } from './audio';

export type Status = 'idle' | 'building' | 'running' | 'paused' | 'halted' | 'error';

export const BASE_RATE = 2_000_000;
export const SPEEDS = [0.25, 0.5, 1, 2, 4, 8, 16, 32];

export interface BenchState {
  lang: Lang;
  status: Status;
  diagnostics: Diagnostic[];
  buildMs: number;
  snapshot: BoardSnapshot | null;
  loc: { file: string; line: number } | null;
  stdout: string;
  uart: string[];
  simNs: number;
  ops: number;
  realtime: number;       // achieved speed vs requested, 0..1
  speed: number;
  message: string | null; // halt / error / info message
  errorLine: { file: string; line: number } | null;
  asm: AsmView | null;
  version: number;
  stats: { code: number; ram: number } | null;
}

export interface AsmView {
  regs: number[];
  flags: { n: boolean; z: boolean; c: boolean; v: boolean };
  changed: number[];
  steps: number;
  cycles: number;
  prog: AsmResult;
  cpu: ArmCpu;
  presets: AsmPresets;
  lastAccess: { addr: number; size: number; write: boolean }[];
}

type Listener = (s: BenchState) => void;

/** Values the student types into registers / memory before running (assembly experiments). */
export interface AsmPresets { regs: Map<number, number>; mem: Map<number, number> }

/** Parse "25", "-7", "0x1F", "0b101", "'A'" into a 32-bit value; null if invalid. */
export function parseValue(text: string): number | null {
  const t = text.trim().replace(/_/g, '');
  if (!t) return null;
  if (/^'.'$/.test(t)) return t.charCodeAt(1);
  if (/^[-+]?0x[0-9a-f]+$/i.test(t)) { const v = parseInt(t.replace(/^[-+]?0x/i, ''), 16); return (t.startsWith('-') ? -v : v) >>> 0; }
  if (/^[-+]?0b[01]+$/i.test(t)) { const v = parseInt(t.replace(/^[-+]?0b/i, ''), 2); return (t.startsWith('-') ? -v : v) >>> 0; }
  if (/^[0-9a-f]{1,8}h$/i.test(t)) return parseInt(t.slice(0, -1), 16) >>> 0;
  if (/^[-+]?\d+$/.test(t)) { const v = Number(t); if (v < -2147483648 || v > 4294967295) return null; return v >>> 0; }
  return null;
}

export class BenchController {
  board = new Board();
  session: Session | null = null;
  cpu: ArmCpu | null = null;
  lang: Lang = 'c';
  files: Record<string, string> = {};
  main = 'main.c';
  wiring: Wiring = emptyWiring();
  breakpoints = new Map<string, Set<number>>();
  speed = 1;
  asmAnimate = false;
  presets: AsmPresets = { regs: new Map(), mem: new Map() };
  private raf = 0;
  private lastFrame = 0;
  private listeners = new Set<Listener>();
  private lastAnimStep = 0;
  state: BenchState = {
    lang: 'c', status: 'idle', diagnostics: [], buildMs: 0, snapshot: null, loc: null, stdout: '', uart: ['', '', '', ''],
    simNs: 0, ops: 0, realtime: 1, speed: 1, message: null, errorLine: null, asm: null, version: 0, stats: null,
  };

  constructor() {
    this.board.setRate(BASE_RATE);
    this.board.onUartTx = () => {};
    this.board.rewire(this.wiring);
  }

  subscribe(fn: Listener): () => void {
    this.listeners.add(fn);
    fn(this.state);
    return () => { this.listeners.delete(fn); };
  }

  private emit(patch: Partial<BenchState>) {
    this.state = { ...this.state, ...patch, version: this.state.version + 1 };
    for (const l of this.listeners) l(this.state);
  }

  // ---------- configuration ----------
  load(lang: Lang, files: Record<string, string>, main: string, wiring: Wiring | undefined, speed = 1) {
    this.stopLoop();
    this.lang = lang;
    this.files = { ...files };
    this.main = main;
    this.presets = { regs: new Map(), mem: new Map() };
    this.session = null;
    this.cpu = null;
    this.setWiring(wiring ?? emptyWiring(), false);
    this.board.keys.clear();
    this.board.sw2 = false;
    this.board.reset();
    this.board.vm = null;
    this.speed = speed;
    this.board.setRate(BASE_RATE * speed);
    audio.silence();
    this.emit({
      lang, status: 'idle', diagnostics: [], snapshot: lang === 'c' ? this.board.snapshot(0) : null, loc: null, stdout: '', uart: ['', '', '', ''],
      simNs: 0, ops: 0, message: null, errorLine: null, asm: null, speed, stats: null,
    });
  }

  updateFiles(files: Record<string, string>) { this.files = { ...files }; }

  setWiring(w: Wiring, emit = true) {
    this.wiring = { cables: { ...w.cables }, jumpers: { ...w.jumpers } };
    this.board.rewire(this.wiring);
    if (emit && this.lang === 'c') this.emit({ snapshot: this.board.snapshot(0) });
  }

  setSpeed(mult: number) {
    this.speed = mult;
    this.board.setRate(BASE_RATE * mult);
    this.emit({ speed: mult });
  }

  setBreakpoints(file: string, lines: Set<number>) {
    this.breakpoints.set(file, new Set(lines));
    this.applyBreakpoints();
  }

  /** Breakpoints on blank lines or comments move to the next line that has code. */
  private applyBreakpoints() {
    if (this.session) {
      const code = new Map<string, number[]>();
      for (const l of this.session.out.lines) { const a = code.get(l.file) ?? []; a.push(l.line); code.set(l.file, a); }
      for (const a of code.values()) a.sort((x, y) => x - y);
      const bp = new Set<string>();
      for (const [f, ls] of this.breakpoints) {
        const avail = code.get(f) ?? [];
        for (const l of ls) { const hit = avail.find(x => x >= l); if (hit !== undefined) bp.add(f + ':' + hit); }
      }
      this.session.vm.breakpoints = bp;
    }
    if (this.cpu) {
      const avail = [...this.cpu.prog.lineAddr.keys()].sort((x, y) => x - y);
      const set = new Set<number>();
      for (const l of this.breakpoints.get(this.main) ?? []) { const hit = avail.find(x => x >= l); if (hit !== undefined) set.add(hit); }
      this.cpu.breakpoints = set;
    }
  }

  // ---------- build ----------
  build(): boolean {
    this.stopLoop();
    audio.silence();
    if (this.lang === 'c') {
      const r = compile(this.files);
      if (!r.ok || !r.out) {
        const e = r.diagnostics.find(d => d.severity === 'error');
        this.session = null;
        this.emit({ status: 'error', diagnostics: r.diagnostics, buildMs: r.ms, message: e ? `Build failed: ${e.msg}` : 'Build failed', errorLine: e ? { file: e.file, line: e.line } : null, loc: null, stats: null });
        return false;
      }
      this.board.vm = null;
      this.session = new Session(r.out, this.board);
      this.board.setRate(BASE_RATE * this.speed);
      this.board.onStdout = () => {};
      this.applyBreakpoints();
      this.emit({
        status: 'paused', diagnostics: r.diagnostics, buildMs: r.ms, message: null, errorLine: null, stdout: '', uart: ['', '', '', ''],
        snapshot: this.board.snapshot(0), loc: null, simNs: 0, ops: 0,
        stats: { code: r.out.stats.romBytes, ram: r.out.stats.ramBytes },
      });
      return true;
    }
    const t0 = performance.now();
    const res = assemble(this.files[this.main] ?? '');
    const ms = performance.now() - t0;
    const diags: Diagnostic[] = res.diags.map(d => ({ file: this.main, line: d.line, msg: d.msg, severity: d.severity }));
    if (!res.ok) {
      const e = diags.find(d => d.severity === 'error')!;
      this.cpu = null;
      this.emit({ status: 'error', diagnostics: diags, buildMs: ms, message: `Assembly failed: ${e.msg}`, errorLine: { file: e.file, line: e.line }, asm: null, loc: null });
      return false;
    }
    this.cpu = new ArmCpu(res);
    this.applyPresets();
    this.applyBreakpoints();
    this.emit({ status: 'paused', diagnostics: diags, buildMs: ms, message: null, errorLine: null, asm: this.asmView(), loc: { file: this.main, line: this.cpu.curLine }, stats: { code: res.codeEnd, ram: res.dataEnd - 0x40000000 } });
    return true;
  }

  private asmView(): AsmView | null {
    const c = this.cpu;
    if (!c) return null;
    return {
      regs: Array.from(c.r), flags: { n: c.n, z: c.z, c: c.c, v: c.v }, changed: [...c.changedRegs], steps: c.steps, cycles: c.cycles,
      prog: c.prog, cpu: c, lastAccess: c.lastAccess.slice(), presets: this.presets,
    };
  }

  // ---------- run control ----------
  run() {
    if (this.lang === 'asm') return this.asmRun();
    if (!this.session || this.session.vm.halted) { if (!this.build()) return; }
    const vm = this.session!.vm;
    vm.setStep(0);
    vm.skipBreakOnce = true;
    audio.resume();
    this.emit({ status: 'running', message: null, loc: null });
    this.startLoop();
  }

  buildAndRun() {
    if (this.build()) this.run();
  }

  pause() {
    if (this.lang === 'asm') { this.asmAnimate = false; this.stopLoop(); this.emit({ status: 'paused' }); return; }
    if (!this.session) return;
    this.session.vm.pauseRequested = true;
  }

  step(mode: 1 | 2 | 3 = 1) {
    if (this.lang === 'asm') return this.asmStep(mode);
    if (!this.session) { if (!this.build()) return; }
    const s = this.session!;
    if (s.vm.halted) return;
    this.stopLoop();
    const vm = s.vm;
    vm.setStep(mode);
    vm.skipBreakOnce = true;
    // run until the step completes, but keep peripherals ticking in real time slices
    let reason = s.advance(5e9, performance.now() + 250);
    if (reason === 'budget' && !vm.halted) {
      // step did not complete quickly (long delay loop): keep running until it does
      this.emit({ status: 'running' });
      this.startLoop();
      return;
    }
    vm.setStep(0);
    this.afterStop(reason);
  }

  reset() {
    this.stopLoop();
    audio.silence();
    if (this.lang === 'asm') {
      if (this.cpu) { this.cpu.reset(); this.applyPresets(); this.applyBreakpoints(); }
      this.emit({ status: this.cpu ? 'paused' : 'idle', message: null, errorLine: null, asm: this.asmView(), loc: this.cpu ? { file: this.main, line: this.cpu.curLine } : null });
      return;
    }
    if (this.session) {
      this.session = new Session(this.session.out, this.board);
      this.board.setRate(BASE_RATE * this.speed);
      this.applyBreakpoints();
    } else this.board.reset();
    this.emit({ status: this.session ? 'paused' : 'idle', message: null, errorLine: null, snapshot: this.board.snapshot(0), loc: null, stdout: '', uart: ['', '', '', ''], simNs: 0, ops: 0 });
  }

  stop() {
    this.stopLoop();
    audio.silence();
    if (this.session) { this.session.vm.halted = true; }
    this.emit({ status: this.session || this.cpu ? 'halted' : 'idle', loc: null, message: 'Stopped.' });
  }

  private afterStop(reason: string) {
    const s = this.session!;
    const snap = this.board.snapshot(0);
    const base = { snapshot: snap, simNs: this.board.ns(), ops: s.vm.ops, stdout: s.stdout, uart: this.board.uarts.map(u => u.out) };
    if (reason === 'error') {
      const e = s.vm.error!;
      audio.silence();
      this.emit({ ...base, status: 'error', message: `Runtime error: ${e.message}`, errorLine: { file: e.file, line: e.line }, loc: { file: e.file, line: e.line } });
    } else if (reason === 'halt') {
      audio.silence();
      this.emit({ ...base, status: 'halted', message: 'main() returned — the program has ended. Embedded programs normally end in while(1).', loc: null });
    } else if (reason === 'break' || reason === 'step') {
      audio.silence();
      this.emit({ ...base, status: 'paused', loc: s.location(), message: null });
    } else this.emit(base);
  }

  // ---------- frame loop ----------
  private startLoop() {
    if (this.raf) return;
    this.lastFrame = performance.now();
    const tick = (now: number) => {
      this.raf = requestAnimationFrame(tick);
      const dt = Math.min(0.1, (now - this.lastFrame) / 1000);
      this.lastFrame = now;
      if (this.lang === 'asm') { this.asmTick(now); return; }
      const s = this.session;
      if (!s) { this.stopLoop(); return; }
      const t0 = performance.now();
      const before = this.board.ns();
      const reason = s.advance(dt * 1e9, t0 + 11);
      const achieved = (this.board.ns() - before) / (dt * 1e9 || 1);
      const snap = this.board.snapshot(dt);
      audio.update(snap, this.speed);
      if (reason !== 'budget') { this.stopLoop(); this.session!.vm.setStep(0); this.afterStop(reason); return; }
      this.emit({
        snapshot: snap, simNs: this.board.ns(), ops: s.vm.ops, stdout: s.stdout, uart: this.board.uarts.map(u => u.out),
        realtime: this.state.realtime * 0.9 + Math.min(1, achieved) * 0.1,
      });
    };
    this.raf = requestAnimationFrame(tick);
  }

  private stopLoop() {
    if (this.raf) cancelAnimationFrame(this.raf);
    this.raf = 0;
  }

  // ---------- assembly ----------
  private asmRun() {
    if (!this.cpu || this.cpu.halted) { if (!this.build()) return; }
    const c = this.cpu!;
    if (this.asmAnimate) {
      this.emit({ status: 'running', message: null });
      this.lastAnimStep = 0;
      this.startLoop();
      return;
    }
    const r = c.run(5_000_000);
    this.asmAfter(r);
  }

  private asmTick(now: number) {
    const c = this.cpu;
    if (!c) { this.stopLoop(); return; }
    if (now - this.lastAnimStep < 140) return;
    this.lastAnimStep = now;
    const r = c.run(1, false);
    if (r !== 'budget' && r !== 'step') { this.stopLoop(); this.asmAfter(r); return; }
    this.emit({ asm: this.asmView(), loc: { file: this.main, line: c.curLine } });
  }

  private asmStep(mode: 1 | 2 | 3) {
    if (!this.cpu) { if (!this.build()) return; }
    const c = this.cpu!;
    if (c.halted) return;
    const r = mode === 2 ? c.stepOver() : c.step();
    this.asmAfter(r === 'step' ? 'stepped' : r);
  }

  private asmAfter(r: string) {
    const c = this.cpu!;
    let message: string | null = null;
    let status: Status = 'paused';
    let errorLine: BenchState['errorLine'] = null;
    if (r === 'halt') { status = 'halted'; message = c.haltMsg; }
    else if (r === 'error') { status = 'error'; message = `Runtime error: ${c.error!.msg}`; errorLine = { file: this.main, line: c.error!.line }; }
    else if (r === 'budget') { message = `Still running after ${c.steps.toLocaleString()} instructions — paused. Is there a loop that never ends?`; }
    else if (r === 'break') message = null;
    this.emit({ status, message, errorLine, asm: this.asmView(), loc: status === 'halted' ? { file: this.main, line: c.curLine } : { file: this.main, line: c.curLine } });
  }

  setAsmAnimate(on: boolean) { this.asmAnimate = on; }

  private applyPresets() {
    const c = this.cpu;
    if (!c) return;
    for (const [i, v] of this.presets.regs) c.r[i] = v >>> 0;
    for (const [a, v] of this.presets.mem) for (let k = 0; k < 4; k++) c.mem.set(a + k, (v >>> (8 * k)) & 0xff);
    c.changedRegs = new Set(this.presets.regs.keys());
  }

  /** Assemble if needed so there is a CPU to edit. */
  private ensureCpu(): ArmCpu | null {
    if (!this.cpu) this.build();
    return this.cpu;
  }

  /** Type a value into a register. Before the first instruction it is kept as an input for every run. */
  setAsmReg(i: number, v: number) {
    const c = this.ensureCpu();
    if (!c) return;
    if (i === 15) { v &= ~3; if (!c.prog.instrs.has(v)) { this.emit({ message: `No instruction at 0x${v.toString(16).toUpperCase()} — PC must point at code.` }); return; } }
    c.r[i] = v >>> 0;
    c.changedRegs = new Set([i]);
    if (i === 15) { c.curLine = c.prog.instrs.get(v)!.line; c.halted = false; }
    if (c.steps === 0) this.presets.regs.set(i, v >>> 0);
    this.emit({ asm: this.asmView(), loc: { file: this.main, line: c.curLine }, message: c.steps === 0 ? null : this.state.message });
  }

  setAsmMem(addr: number, v: number) {
    const c = this.ensureCpu();
    if (!c) return;
    if (addr < 0x40000000 || addr >= 0x40008000) { this.emit({ message: 'Only RAM (0x40000000 – 0x40007FFF) can be edited; code and constants are read-only.' }); return; }
    for (let k = 0; k < 4; k++) { c.mem.set(addr + k, (v >>> (8 * k)) & 0xff); c.written.set(addr + k, c.steps); }
    if (c.steps === 0) this.presets.mem.set(addr, v >>> 0);
    this.emit({ asm: this.asmView() });
  }

  toggleAsmFlag(f: 'n' | 'z' | 'c' | 'v') {
    const c = this.ensureCpu();
    if (!c) return;
    c[f] = !c[f];
    this.emit({ asm: this.asmView() });
  }

  clearAsmPresets() {
    this.presets = { regs: new Map(), mem: new Map() };
    if (this.cpu) { this.cpu.reset(); this.applyBreakpoints(); }
    this.emit({ asm: this.asmView(), status: this.cpu ? 'paused' : this.state.status, message: null, loc: this.cpu ? { file: this.main, line: this.cpu.curLine } : null });
  }

  // ---------- inputs ----------
  pressKey(k: number, down: boolean) { this.board.pressKey(k, down); this.poke(); }
  setBounce(on: boolean) { this.board.bounce = on; }
  setSw2(down: boolean) { this.board.setSw2(down); this.poke(); }
  setPot(i: number, v: number) { this.board.potVolts[i] = v; this.board.checkInputs(); this.poke(); }
  sendUart(u: number, text: string) { for (const ch of text) this.board.uartReceive(u, ch.charCodeAt(0)); this.poke(); }
  clearUart(u: number) { this.board.uarts[u].out = ''; this.emit({ uart: this.board.uarts.map(x => x.out) }); }

  private poke() {
    if (this.state.status !== 'running' && this.lang === 'c') this.emit({ snapshot: this.board.snapshot(0) });
  }

  /** Values of global variables (C) for the watch panel. */
  watch() { return this.session ? this.session.inspect() : []; }

  dispose() { this.stopLoop(); audio.silence(); }
}
