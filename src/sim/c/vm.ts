import { MK } from './types';
import { CError } from './lexer';

export const enum Op {
  NOP, PUSH, PUSHF, POP, DUP, SWAP,
  LOAD, STORE, STORE_POP,
  LADDR, LLOAD, LSTORE, GLOAD, GSTORE,
  INCDEC, LINCDEC, GINCDEC,
  CVT,
  IADD, UADD, FADD, ISUB, USUB, FSUB, IMUL, UMUL, FMUL, IDIV, UDIV, FDIV, IMOD, UMOD, FMOD,
  AND, OR, XOR, SHL, SAR, SHR, NEG, FNEG, BNOT, LNOT,
  EQ, NE, LT, LE, GT, GE,
  JMP, JZ, JNZ,
  CALL, CALLB, RET, RETV,
  STMT, HALT, MEMCPY, MEMZERO, POPN,
}

export const enum Cvt { I8, U8, I16, U16, I32, U32, F32, F2I32, F2U32, BOOL, TRUNC }

export interface FuncInfo {
  name: string;
  entry: number;
  frameSize: number;
  params: { off: number; mk: MK }[];
  returnsValue: boolean;
  file: string;
  line: number;
  endLine: number;
}

export interface Bus {
  read(addr: number, size: number): number;
  write(addr: number, size: number, value: number): void;
}

export interface DebugLoc { file: string; line: number }

export type Builtin = (vm: VM, args: number[]) => number;

export const RAM_BASE = 0x10000000;
export const RAM_SIZE = 0x8000;
export const ROM_BASE = 0x00000000;
export const ROM_SIZE = 0x80000;

export class RuntimeError extends Error {
  constructor(msg: string, public file: string, public line: number) { super(msg); }
}

export type StopReason = 'budget' | 'halt' | 'break' | 'step' | 'error' | 'wfi';

interface Frame { retPc: number; fp: number; sp: number; fn: number; irq: number; vsp: number }

export class VM {
  code: Int32Array;
  consts: Float64Array;
  funcs: FuncInfo[];
  lines: { file: string; line: number }[]; // STMT operand -> location
  builtins: Builtin[];
  ram: ArrayBuffer;
  ramDv: DataView;
  ramU8: Uint8Array;
  rom: Uint8Array;
  romDv: DataView;
  bus: Bus;

  pc = 0;
  fp = 0;
  sp = RAM_BASE + RAM_SIZE;
  stack = new Float64Array(8192);
  vsp = 0;
  frames: Frame[] = [];
  halted = false;
  ops = 0;            // executed operations (time base)
  curLoc = 0;         // index into lines
  globalsEnd: number;
  error: RuntimeError | null = null;

  // debugging
  breakpoints = new Set<string>(); // "file:line"
  stepMode: 0 | 1 | 2 | 3 = 0;      // 0 none, 1 into, 2 over, 3 out
  stepDepth = 0;
  stepFromLoc = -1;
  skipBreakOnce = false;

  // interrupts
  irqPending: () => number = () => -1; // returns irq number (>=0) or -1, -2 = systick
  irqHandlers = new Map<number, number>(); // irq -> func index
  irqCheck = false;  // fast flag set by board when something may be pending
  activeIrq: number[] = [];
  primask = false;
  onIrqEnter: (irq: number) => void = () => {};
  onIrqExit: (irq: number) => void = () => {};

  stdout: (s: string) => void = () => {};

  constructor(opts: {
    code: Int32Array; consts: Float64Array; funcs: FuncInfo[]; lines: { file: string; line: number }[];
    builtins: Builtin[]; rom: Uint8Array; ramInit: Uint8Array; globalsEnd: number; bus: Bus; entry: number;
  }) {
    this.code = opts.code;
    this.consts = opts.consts;
    this.funcs = opts.funcs;
    this.lines = opts.lines;
    this.builtins = opts.builtins;
    this.rom = opts.rom;
    this.romDv = new DataView(opts.rom.buffer, opts.rom.byteOffset, opts.rom.byteLength);
    this.ram = new ArrayBuffer(RAM_SIZE);
    this.ramDv = new DataView(this.ram);
    this.ramU8 = new Uint8Array(this.ram);
    this.ramU8.set(opts.ramInit);
    // Above the globals, RAM holds whatever was there before (as on the real chip), so an
    // uninitialised local variable gets junk instead of a convenient 0.
    let seed = 0x2545f491;
    for (let i = opts.globalsEnd - RAM_BASE; i < RAM_SIZE; i++) { seed = (Math.imul(seed, 1103515245) + 12345) >>> 0; this.ramU8[i] = seed >>> 24; }
    this.globalsEnd = opts.globalsEnd;
    this.bus = opts.bus;
    this.enter(opts.entry, [], this.code.length - 1, -1);
  }

  loc(): DebugLoc { return this.lines[this.curLoc] ?? { file: '', line: 0 }; }

  fault(msg: string): never {
    const l = this.loc();
    throw new RuntimeError(msg, l.file, l.line);
  }

  // ---------- memory ----------
  read(addr: number, mk: MK): number {
    const o = addr - RAM_BASE;
    if (o >= 0 && o < RAM_SIZE - 7) {
      const dv = this.ramDv;
      switch (mk) {
        case MK.I8: return dv.getInt8(o);
        case MK.U8: return dv.getUint8(o);
        case MK.I16: return dv.getInt16(o, true);
        case MK.U16: return dv.getUint16(o, true);
        case MK.I32: return dv.getInt32(o, true);
        case MK.U32: return dv.getUint32(o, true);
        case MK.F32: return dv.getFloat32(o, true);
        case MK.F64: return dv.getFloat64(o, true);
      }
    }
    return this.readSlow(addr >>> 0, mk);
  }

  readSlow(addr: number, mk: MK): number {
    const size = mk <= MK.U8 ? 1 : mk <= MK.U16 ? 2 : mk === MK.F64 ? 8 : 4;
    if (addr < ROM_SIZE) {
      if (addr + size > ROM_SIZE) this.fault(`Read past end of flash at 0x${addr.toString(16)}`);
      const dv = this.romDv;
      switch (mk) {
        case MK.I8: return dv.getInt8(addr);
        case MK.U8: return dv.getUint8(addr);
        case MK.I16: return dv.getInt16(addr, true);
        case MK.U16: return dv.getUint16(addr, true);
        case MK.I32: return dv.getInt32(addr, true);
        case MK.U32: return dv.getUint32(addr, true);
        case MK.F32: return dv.getFloat32(addr, true);
        case MK.F64: return dv.getFloat64(addr, true);
      }
    }
    if (addr >= RAM_BASE && addr < RAM_BASE + RAM_SIZE) {
      const o = addr - RAM_BASE;
      if (o + size > RAM_SIZE) this.fault('Read past end of RAM');
      return this.read(addr, mk);
    }
    if (addr >= 0x20000000) {
      if (mk === MK.F32 || mk === MK.F64) this.fault('Floating-point access to a peripheral register');
      let v = this.bus.read(addr, size);
      if (mk === MK.I8) v = (v << 24) >> 24;
      else if (mk === MK.I16) v = (v << 16) >> 16;
      else if (mk === MK.I32) v = v | 0;
      return v;
    }
    this.fault(`Invalid memory read at address 0x${addr.toString(16).toUpperCase().padStart(8, '0')} (bad pointer?)`);
  }

  write(addr: number, mk: MK, v: number) {
    const o = addr - RAM_BASE;
    if (o >= 0 && o < RAM_SIZE - 7) {
      const dv = this.ramDv;
      switch (mk) {
        case MK.I8: case MK.U8: dv.setUint8(o, v & 0xff); return;
        case MK.I16: case MK.U16: dv.setUint16(o, v & 0xffff, true); return;
        case MK.I32: case MK.U32: dv.setUint32(o, v >>> 0, true); return;
        case MK.F32: dv.setFloat32(o, v, true); return;
        case MK.F64: dv.setFloat64(o, v, true); return;
      }
    }
    this.writeSlow(addr >>> 0, mk, v);
  }

  writeSlow(addr: number, mk: MK, v: number) {
    const size = mk <= MK.U8 ? 1 : mk <= MK.U16 ? 2 : mk === MK.F64 ? 8 : 4;
    if (addr >= RAM_BASE && addr + size <= RAM_BASE + RAM_SIZE) {
      const o = addr - RAM_BASE;
      const dv = this.ramDv;
      switch (mk) {
        case MK.I8: case MK.U8: dv.setUint8(o, v & 0xff); return;
        case MK.I16: case MK.U16: dv.setUint16(o, v & 0xffff, true); return;
        case MK.I32: case MK.U32: dv.setUint32(o, v >>> 0, true); return;
        case MK.F32: dv.setFloat32(o, v, true); return;
        case MK.F64: dv.setFloat64(o, v, true); return;
      }
    }
    if (addr < ROM_SIZE) this.fault(`Write to read-only flash at 0x${addr.toString(16).toUpperCase().padStart(8, '0')} (writing to a string literal?)`);
    if (addr >= 0x20000000) {
      if (mk === MK.F32 || mk === MK.F64) this.fault('Floating-point write to a peripheral register');
      this.bus.write(addr, size, v >>> 0 & (size === 4 ? 0xffffffff : size === 2 ? 0xffff : 0xff));
      return;
    }
    this.fault(`Invalid memory write at address 0x${addr.toString(16).toUpperCase().padStart(8, '0')} (bad pointer?)`);
  }

  readByte(addr: number): number { return this.read(addr, MK.U8); }
  readCString(addr: number, max = 4096): string {
    let s = '';
    for (let i = 0; i < max; i++) {
      const c = this.read(addr + i, MK.U8);
      if (c === 0) return s;
      s += String.fromCharCode(c);
    }
    return s;
  }
  writeBytes(addr: number, bytes: number[]) { for (let i = 0; i < bytes.length; i++) this.write(addr + i, MK.U8, bytes[i]); }

  // ---------- calls ----------
  enter(fnIndex: number, args: number[], retPc: number, irq: number) {
    const f = this.funcs[fnIndex];
    const newSp = this.sp - f.frameSize;
    if (newSp < this.globalsEnd + 64) this.fault('Stack overflow — too much recursion or very large local arrays');
    this.frames.push({ retPc, fp: this.fp, sp: this.sp, fn: fnIndex, irq, vsp: this.vsp });
    this.sp = newSp;
    this.fp = newSp;
    for (let i = 0; i < f.params.length; i++) {
      this.write(this.fp + f.params[i].off, f.params[i].mk, args[i] ?? 0);
    }
    this.pc = f.entry;
  }

  callDepth() { return this.frames.length; }

  /** Request to stop at the next statement (used by the Pause button). */
  pauseRequested = false;

  run(budget: number): StopReason {
    const code = this.code;
    const st = this.stack;
    let pc = this.pc;
    let vsp = this.vsp;
    const end = this.ops + budget;
    let ops = this.ops;
    let a: number, b: number;
    try {
      while (ops < end) {
        ops++;
        const op = code[pc++];
        switch (op) {
          case Op.NOP: break;
          case Op.PUSH: st[vsp++] = code[pc++]; break;
          case Op.PUSHF: st[vsp++] = this.consts[code[pc++]]; break;
          case Op.POP: vsp--; break;
          case Op.POPN: vsp -= code[pc++]; break;
          case Op.DUP: st[vsp] = st[vsp - 1]; vsp++; break;
          case Op.SWAP: a = st[vsp - 1]; st[vsp - 1] = st[vsp - 2]; st[vsp - 2] = a; break;
          case Op.LOAD: st[vsp - 1] = this.read(st[vsp - 1], code[pc++]); break;
          case Op.STORE: a = st[--vsp]; this.write(st[vsp - 1], code[pc++], a); st[vsp - 1] = a; break;
          case Op.STORE_POP: a = st[--vsp]; this.write(st[--vsp], code[pc++], a); break;
          case Op.LADDR: st[vsp++] = this.fp + code[pc++]; break;
          case Op.LLOAD: { const mk = code[pc++]; st[vsp++] = this.read(this.fp + code[pc++], mk); break; }
          case Op.LSTORE: { const mk = code[pc++]; this.write(this.fp + code[pc++], mk, st[--vsp]); break; }
          case Op.GLOAD: { const mk = code[pc++]; st[vsp++] = this.read(code[pc++] >>> 0, mk); break; }
          case Op.GSTORE: { const mk = code[pc++]; this.write(code[pc++] >>> 0, mk, st[--vsp]); break; }
          case Op.INCDEC: case Op.LINCDEC: case Op.GINCDEC: {
            const mk = code[pc++];
            let addr: number;
            if (op === Op.INCDEC) addr = st[--vsp];
            else if (op === Op.LINCDEC) addr = this.fp + code[pc++];
            else addr = code[pc++] >>> 0;
            const delta = this.consts[code[pc++]];
            const mode = code[pc++];
            const old = this.read(addr, mk);
            this.write(addr, mk, old + delta);
            if (mode === 0) st[vsp++] = this.read(addr, mk);
            else if (mode === 1) st[vsp++] = old;
            break;
          }
          case Op.CVT: {
            a = st[vsp - 1];
            switch (code[pc++]) {
              case Cvt.I8: a = (a << 24) >> 24; break;
              case Cvt.U8: a = a & 0xff; break;
              case Cvt.I16: a = (a << 16) >> 16; break;
              case Cvt.U16: a = a & 0xffff; break;
              case Cvt.I32: a = a | 0; break;
              case Cvt.U32: a = a >>> 0; break;
              case Cvt.F32: a = Math.fround(a); break;
              case Cvt.F2I32: a = (isFinite(a) ? Math.trunc(a) : 0) | 0; break;
              case Cvt.F2U32: a = (isFinite(a) ? Math.trunc(a) : 0) >>> 0; break;
              case Cvt.BOOL: a = a !== 0 ? 1 : 0; break;
              case Cvt.TRUNC: a = Math.trunc(a); break;
            }
            st[vsp - 1] = a;
            break;
          }
          case Op.IADD: b = st[--vsp]; st[vsp - 1] = (st[vsp - 1] + b) | 0; break;
          case Op.UADD: b = st[--vsp]; st[vsp - 1] = (st[vsp - 1] + b) >>> 0; break;
          case Op.FADD: b = st[--vsp]; st[vsp - 1] = st[vsp - 1] + b; break;
          case Op.ISUB: b = st[--vsp]; st[vsp - 1] = (st[vsp - 1] - b) | 0; break;
          case Op.USUB: b = st[--vsp]; st[vsp - 1] = (st[vsp - 1] - b) >>> 0; break;
          case Op.FSUB: b = st[--vsp]; st[vsp - 1] = st[vsp - 1] - b; break;
          case Op.IMUL: b = st[--vsp]; st[vsp - 1] = Math.imul(st[vsp - 1], b); break;
          case Op.UMUL: b = st[--vsp]; st[vsp - 1] = Math.imul(st[vsp - 1], b) >>> 0; break;
          case Op.FMUL: b = st[--vsp]; st[vsp - 1] = st[vsp - 1] * b; break;
          case Op.IDIV: b = st[--vsp]; if (b === 0) { this.pc = pc; this.fault('Integer division by zero'); } st[vsp - 1] = (st[vsp - 1] / b) | 0; break;
          case Op.UDIV: b = st[--vsp]; if (b === 0) { this.pc = pc; this.fault('Integer division by zero'); } st[vsp - 1] = Math.trunc(st[vsp - 1] / b) >>> 0; break;
          case Op.FDIV: b = st[--vsp]; st[vsp - 1] = st[vsp - 1] / b; break;
          case Op.IMOD: b = st[--vsp]; if (b === 0) { this.pc = pc; this.fault('Integer modulo by zero'); } st[vsp - 1] = (st[vsp - 1] % b) | 0; break;
          case Op.UMOD: b = st[--vsp]; if (b === 0) { this.pc = pc; this.fault('Integer modulo by zero'); } st[vsp - 1] = (st[vsp - 1] % b) >>> 0; break;
          case Op.FMOD: b = st[--vsp]; st[vsp - 1] = st[vsp - 1] % b; break;
          case Op.AND: b = st[--vsp]; st[vsp - 1] = st[vsp - 1] & b; break;
          case Op.OR: b = st[--vsp]; st[vsp - 1] = st[vsp - 1] | b; break;
          case Op.XOR: b = st[--vsp]; st[vsp - 1] = st[vsp - 1] ^ b; break;
          case Op.SHL: b = st[--vsp]; st[vsp - 1] = st[vsp - 1] << (b & 31); break;
          case Op.SAR: b = st[--vsp]; st[vsp - 1] = st[vsp - 1] >> (b & 31); break;
          case Op.SHR: b = st[--vsp]; st[vsp - 1] = st[vsp - 1] >>> (b & 31); break;
          case Op.NEG: st[vsp - 1] = (-st[vsp - 1]) | 0; break;
          case Op.FNEG: st[vsp - 1] = -st[vsp - 1]; break;
          case Op.BNOT: st[vsp - 1] = ~st[vsp - 1]; break;
          case Op.LNOT: st[vsp - 1] = st[vsp - 1] === 0 ? 1 : 0; break;
          case Op.EQ: b = st[--vsp]; st[vsp - 1] = st[vsp - 1] === b ? 1 : 0; break;
          case Op.NE: b = st[--vsp]; st[vsp - 1] = st[vsp - 1] !== b ? 1 : 0; break;
          case Op.LT: b = st[--vsp]; st[vsp - 1] = st[vsp - 1] < b ? 1 : 0; break;
          case Op.LE: b = st[--vsp]; st[vsp - 1] = st[vsp - 1] <= b ? 1 : 0; break;
          case Op.GT: b = st[--vsp]; st[vsp - 1] = st[vsp - 1] > b ? 1 : 0; break;
          case Op.GE: b = st[--vsp]; st[vsp - 1] = st[vsp - 1] >= b ? 1 : 0; break;
          case Op.JMP: pc = code[pc]; break;
          case Op.JZ: if (st[--vsp] === 0) pc = code[pc]; else pc++; break;
          case Op.JNZ: if (st[--vsp] !== 0) pc = code[pc]; else pc++; break;
          case Op.CALL: {
            const fi = code[pc++];
            const n = code[pc++];
            vsp -= n;
            const args = n ? Array.from(st.subarray(vsp, vsp + n)) : [];
            this.vsp = vsp;
            this.enter(fi, args, pc, -1);
            pc = this.pc;
            if (this.frames.length > 4000) this.fault('Stack overflow — runaway recursion');
            break;
          }
          case Op.CALLB: {
            const bi = code[pc++];
            const n = code[pc++];
            vsp -= n;
            const args = n ? Array.from(st.subarray(vsp, vsp + n)) : [];
            this.pc = pc; this.vsp = vsp; this.ops = ops;
            st[vsp++] = this.builtins[bi](this, args);
            if (this.halted) { this.pc = pc; this.vsp = vsp; this.ops = ops; return 'halt'; }
            break;
          }
          case Op.RET: case Op.RETV: {
            const rv = op === Op.RETV ? st[vsp - 1] : 0;
            const fr = this.frames.pop()!;
            this.fp = fr.fp;
            this.sp = fr.sp;
            pc = fr.retPc;
            vsp = fr.vsp;
            if (fr.irq >= 0) {
              this.activeIrq.pop();
              this.onIrqExit(fr.irq);
              this.irqCheck = true;
            } else if (this.frames.length === 0) {
              this.halted = true;
              this.pc = pc; this.vsp = vsp; this.ops = ops;
              return 'halt';
            } else if (op === Op.RETV) st[vsp++] = rv;
            else if (this.funcs[fr.fn].returnsValue) st[vsp++] = 0;
            break;
          }
          case Op.STMT: {
            const li = code[pc++];
            this.curLoc = li;
            this.ops = ops;
            if (this.irqCheck && !this.primask) {
              this.pc = pc; this.vsp = vsp; this.ops = ops;
              if (this.tryIrq(pc)) { pc = this.pc; vsp = this.vsp; break; }
            }
            if (this.stepMode || this.breakpoints.size || this.pauseRequested) {
              if (this.shouldStop(li)) {
                this.pc = pc - 2; this.vsp = vsp; this.ops = ops;
                return this.stepMode ? 'step' : 'break';
              }
            }
            break;
          }
          case Op.MEMCPY: {
            const size = code[pc++];
            const src = st[--vsp];
            const dst = st[--vsp];
            for (let i = 0; i < size; i++) this.write(dst + i, MK.U8, this.read(src + i, MK.U8));
            break;
          }
          case Op.MEMZERO: {
            const size = code[pc++];
            const dst = st[--vsp];
            for (let i = 0; i < size; i++) this.write(dst + i, MK.U8, 0);
            break;
          }
          case Op.HALT:
            this.halted = true;
            this.pc = pc - 1; this.vsp = vsp; this.ops = ops;
            return 'halt';
          default:
            throw new Error('bad opcode ' + op + ' at ' + (pc - 1));
        }
      }
    } catch (e) {
      this.pc = pc; this.vsp = vsp; this.ops = ops;
      if (e instanceof RuntimeError) { this.error = e; this.halted = true; return 'error'; }
      if (e instanceof CError) { this.error = new RuntimeError(e.message, e.file, e.line); this.halted = true; return 'error'; }
      if (e instanceof RangeError) {
        const l = this.loc();
        this.error = new RuntimeError('Internal stack overflow — expression too complex or runaway recursion', l.file, l.line);
        this.halted = true; return 'error';
      }
      throw e;
    }
    this.pc = pc; this.vsp = vsp; this.ops = ops;
    return 'budget';
  }

  private shouldStop(li: number): boolean {
    if (this.skipBreakOnce) { this.skipBreakOnce = false; this.stepFromLoc = li; return false; }
    if (this.pauseRequested) { this.pauseRequested = false; this.skipBreakOnce = true; return true; }
    const l = this.lines[li];
    const sameLine = (() => {
      const f = this.lines[this.stepFromLoc];
      return f && f.line === l.line && f.file === l.file;
    })();
    if (this.stepMode === 1) {
      if (!sameLine || this.frames.length !== this.stepDepth) { this.skipBreakOnce = true; return true; }
    } else if (this.stepMode === 2) {
      if (this.frames.length < this.stepDepth || (this.frames.length === this.stepDepth && !sameLine)) { this.skipBreakOnce = true; return true; }
    } else if (this.stepMode === 3) {
      if (this.frames.length < this.stepDepth) { this.skipBreakOnce = true; return true; }
    }
    if (this.breakpoints.has(l.file + ':' + l.line) && !sameLine) {
      this.skipBreakOnce = true;
      return true;
    }
    if (!sameLine) this.stepFromLoc = -1;
    return false;
  }

  /** Begin stepping from the current location. */
  setStep(mode: 0 | 1 | 2 | 3) {
    this.stepMode = mode;
    this.stepDepth = this.frames.length;
    this.stepFromLoc = this.curLoc;
  }

  private tryIrq(pc: number): boolean {
    const irq = this.irqPending();
    if (irq === -1000) { this.irqCheck = false; return false; }
    if (irq === -1001) return false;
    const fn = this.irqHandlers.get(irq);
    if (fn === undefined) return false;
    if (this.activeIrq.length) return false; // no nesting
    this.activeIrq.push(irq);
    this.onIrqEnter(irq);
    this.enter(fn, [], pc, irq);
    return true;
  }
}
