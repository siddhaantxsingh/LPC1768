import { AsmResult, CODE_BASE, DATA_BASE, Instr, RAM_END, Shift, immValue } from './assembler';

export type CpuStop = 'step' | 'break' | 'halt' | 'error' | 'budget';

export class ArmCpu {
  r = new Uint32Array(16);
  n = false; z = false; c = false; v = false;
  mem = new Map<number, number>();
  written = new Map<number, number>();   // byte addr -> step index when last written
  changedRegs = new Set<number>();
  steps = 0;
  cycles = 0;
  halted = false;
  haltMsg = '';
  error: { msg: string; line: number } | null = null;
  breakpoints = new Set<number>();       // source lines
  curLine = 0;
  lastAccess: { addr: number; size: number; write: boolean }[] = [];
  callDepth = 0;

  constructor(public prog: AsmResult) { this.reset(); }

  reset() {
    this.r.fill(0);
    this.r[13] = RAM_END;     // full-descending stack at the top of on-chip RAM
    this.r[15] = this.prog.entry;
    this.n = this.z = this.c = this.v = false;
    this.mem = new Map(this.prog.memory);
    this.written.clear();
    this.changedRegs.clear();
    this.steps = 0; this.cycles = 0;
    this.halted = false; this.haltMsg = ''; this.error = null;
    this.callDepth = 0;
    this.curLine = this.prog.instrs.get(this.prog.entry)?.line ?? 0;
  }

  cpsr(): number { return ((this.n ? 1 : 0) << 31 | (this.z ? 1 : 0) << 30 | (this.c ? 1 : 0) << 29 | (this.v ? 1 : 0) << 28 | 0x13) >>> 0; }

  // ---------- memory (Keil-style access checks) ----------
  private check(addr: number, size: number, write: boolean) {
    const inCode = addr >= CODE_BASE && addr + size <= 0x00080000;
    const inRam = addr >= DATA_BASE && addr + size <= RAM_END;
    if (write && !inRam) {
      throw new Error(`Access violation at 0x${hex8(addr)}: no 'write' permission${inCode ? ' (this address is in the read-only CODE area — put variables in a DATA, READWRITE area)' : ''}`);
    }
    if (!write && !inCode && !inRam) throw new Error(`Access violation at 0x${hex8(addr)}: no 'read' permission (invalid address — check the pointer register)`);
  }
  read8(a: number) { a >>>= 0; this.check(a, 1, false); this.lastAccess.push({ addr: a, size: 1, write: false }); return this.mem.get(a) ?? 0; }
  read16(a: number) { a >>>= 0; this.check(a & ~1, 2, false); a &= ~1; this.lastAccess.push({ addr: a, size: 2, write: false }); return (this.mem.get(a) ?? 0) | ((this.mem.get(a + 1) ?? 0) << 8); }
  read32(a: number) {
    a >>>= 0;
    const al = a & ~3;
    this.check(al, 4, false);
    this.lastAccess.push({ addr: al, size: 4, write: false });
    const w = ((this.mem.get(al) ?? 0) | ((this.mem.get(al + 1) ?? 0) << 8) | ((this.mem.get(al + 2) ?? 0) << 16) | ((this.mem.get(al + 3) ?? 0) << 24)) >>> 0;
    const rot = (a & 3) * 8; // ARMv4: unaligned loads rotate the word
    return rot ? ((w >>> rot) | (w << (32 - rot))) >>> 0 : w;
  }
  write8(a: number, v: number) { a >>>= 0; this.check(a, 1, true); this.mem.set(a, v & 0xff); this.written.set(a, this.steps); this.lastAccess.push({ addr: a, size: 1, write: true }); }
  write16(a: number, v: number) { a = (a >>> 0) & ~1; this.check(a, 2, true); this.mem.set(a, v & 0xff); this.mem.set(a + 1, (v >>> 8) & 0xff); this.written.set(a, this.steps); this.written.set(a + 1, this.steps); this.lastAccess.push({ addr: a, size: 2, write: true }); }
  write32(a: number, v: number) {
    a = (a >>> 0) & ~3;
    this.check(a, 4, true);
    for (let i = 0; i < 4; i++) { this.mem.set(a + i, (v >>> (i * 8)) & 0xff); this.written.set(a + i, this.steps); }
    this.lastAccess.push({ addr: a, size: 4, write: true });
  }
  peek32(a: number): number { return ((this.mem.get(a) ?? 0) | ((this.mem.get(a + 1) ?? 0) << 8) | ((this.mem.get(a + 2) ?? 0) << 16) | ((this.mem.get(a + 3) ?? 0) << 24)) >>> 0; }

  private setReg(i: number, v: number) { this.r[i] = v >>> 0; this.changedRegs.add(i); }

  private condPass(c: number): boolean {
    switch (c) {
      case 0: return this.z; case 1: return !this.z;
      case 2: return this.c; case 3: return !this.c;
      case 4: return this.n; case 5: return !this.n;
      case 6: return this.v; case 7: return !this.v;
      case 8: return this.c && !this.z; case 9: return !this.c || this.z;
      case 10: return this.n === this.v; case 11: return this.n !== this.v;
      case 12: return !this.z && this.n === this.v; case 13: return this.z || this.n !== this.v;
      default: return true;
    }
  }

  /** Read a register as an operand (PC reads as instruction address + 8). */
  private rv(i: number, pc: number) { return i === 15 ? (pc + 8) >>> 0 : this.r[i]; }

  private shifter(sh: Shift, val: number, pc: number): [number, boolean] {
    let amt: number;
    if (sh.reg !== null) {
      amt = this.r[sh.reg] & 0xff;
      if (amt === 0) return [val, this.c];
      switch (sh.type) {
        case 'LSL': return amt < 32 ? [(val << amt) >>> 0, ((val >>> (32 - amt)) & 1) === 1] : amt === 32 ? [0, (val & 1) === 1] : [0, false];
        case 'LSR': return amt < 32 ? [val >>> amt, ((val >>> (amt - 1)) & 1) === 1] : amt === 32 ? [0, (val >>> 31) === 1] : [0, false];
        case 'ASR': return amt < 32 ? [(val | 0) >> amt >>> 0, (((val | 0) >> (amt - 1)) & 1) === 1] : [(val | 0) < 0 ? 0xffffffff : 0, (val >>> 31) === 1];
        case 'ROR': { const r = amt & 31; if (r === 0) return [val, (val >>> 31) === 1]; const res = ((val >>> r) | (val << (32 - r))) >>> 0; return [res, (res >>> 31) === 1]; }
        default: return [val, this.c];
      }
    }
    void pc;
    amt = sh.amount;
    switch (sh.type) {
      case 'LSL': if (amt === 0) return [val, this.c]; return [(val << amt) >>> 0, ((val >>> (32 - amt)) & 1) === 1];
      case 'LSR': if (amt === 32) return [0, (val >>> 31) === 1]; return [val >>> amt, ((val >>> (amt - 1)) & 1) === 1];
      case 'ASR': if (amt === 32) return [(val | 0) < 0 ? 0xffffffff : 0, (val >>> 31) === 1]; return [((val | 0) >> amt) >>> 0, (((val | 0) >> (amt - 1)) & 1) === 1];
      case 'ROR': { const res = ((val >>> amt) | (val << (32 - amt))) >>> 0; return [res, (res >>> 31) === 1]; }
      case 'RRX': return [((this.c ? 0x80000000 : 0) | (val >>> 1)) >>> 0, (val & 1) === 1];
    }
  }

  /** Execute one instruction. */
  step(): CpuStop {
    if (this.halted) return this.error ? 'error' : 'halt';
    const pc = this.r[15];
    const ent = this.prog.instrs.get(pc);
    this.changedRegs.clear();
    this.lastAccess = [];
    if (!ent) {
      const inData = pc >= DATA_BASE;
      this.halted = true;
      this.error = { msg: inData ? `PC jumped into the DATA area (0x${hex8(pc)}).` : `PC reached 0x${hex8(pc)}, past the last instruction. End programs with an infinite loop such as  STOP B STOP.`, line: this.curLine };
      return 'error';
    }
    this.curLine = ent.line;
    const ins = ent.instr;
    try {
      this.steps++;
      this.cycles += 1;
      let nextPc = (pc + 4) >>> 0;
      if (this.condPass((ins as any).cond)) {
        const res = this.exec(ins, pc);
        if (res !== null) nextPc = res >>> 0;
      }
      if (ins.op === 'b' && !ins.link && ins.target === pc && this.condPass(ins.cond)) {
        this.halted = true;
        this.haltMsg = `Program finished — reached the infinite loop at 0x${hex8(pc)}.`;
        this.r[15] = pc;
        return 'halt';
      }
      if (this.changedRegs.has(15) && nextPc === pc + 4) nextPc = this.r[15];
      this.r[15] = nextPc;
      const nxt = this.prog.instrs.get(nextPc);
      if (nxt) this.curLine = nxt.line;
      return 'step';
    } catch (e) {
      this.halted = true;
      this.error = { msg: (e as Error).message, line: ent.line };
      return 'error';
    }
  }

  /** Run until a stop condition or `budget` instructions. */
  run(budget: number, ignoreBreakAtStart = true): CpuStop {
    let first = ignoreBreakAtStart;
    for (let i = 0; i < budget; i++) {
      if (!first) {
        const e = this.prog.instrs.get(this.r[15]);
        if (e && this.breakpoints.has(e.line)) return 'break';
      }
      first = false;
      const s = this.step();
      if (s !== 'step') return s;
    }
    return 'budget';
  }

  /** Step over: run until the instruction after a BL returns. */
  stepOver(): CpuStop {
    const pc = this.r[15];
    const ent = this.prog.instrs.get(pc);
    if (ent && ent.instr.op === 'b' && ent.instr.link) {
      const ret = pc + 4;
      for (let i = 0; i < 2_000_000; i++) {
        const s = this.step();
        if (s !== 'step') return s;
        if (this.r[15] === ret) return 'step';
        const e = this.prog.instrs.get(this.r[15]);
        if (e && this.breakpoints.has(e.line)) return 'break';
      }
      return 'budget';
    }
    return this.step();
  }

  private exec(i: Instr, pc: number): number | null {
    switch (i.op) {
      case 'dp': {
        let op2: number, sc: boolean;
        if (i.op2.kind === 'imm') {
          op2 = immValue(i.op2.rot, i.op2.imm8);
          sc = i.op2.rot ? (op2 >>> 31) === 1 : this.c;
        } else {
          [op2, sc] = this.shifter(i.op2.shift, this.rv(i.op2.rm, pc) + (i.op2.shift.reg !== null && i.op2.rm === 15 ? 4 : 0), pc);
          op2 >>>= 0;
        }
        const a = this.rv(i.rn, pc);
        let res = 0, wr = true, logical = false, cOut = this.c, vOut = this.v;
        const add = (x: number, y: number, cin: number) => {
          const r = x + y + cin;
          cOut = r > 0xffffffff;
          const rr = r >>> 0;
          vOut = ((~(x ^ y) & (x ^ rr)) >>> 31) === 1;
          return rr;
        };
        switch (i.mn) {
          case 'AND': res = (a & op2) >>> 0; logical = true; break;
          case 'EOR': res = (a ^ op2) >>> 0; logical = true; break;
          case 'ORR': res = (a | op2) >>> 0; logical = true; break;
          case 'BIC': res = (a & ~op2) >>> 0; logical = true; break;
          case 'MOV': res = op2; logical = true; break;
          case 'MVN': res = (~op2) >>> 0; logical = true; break;
          case 'TST': res = (a & op2) >>> 0; logical = true; wr = false; break;
          case 'TEQ': res = (a ^ op2) >>> 0; logical = true; wr = false; break;
          case 'ADD': res = add(a, op2, 0); break;
          case 'ADC': res = add(a, op2, this.c ? 1 : 0); break;
          case 'SUB': res = add(a, (~op2) >>> 0, 1); break;
          case 'SBC': res = add(a, (~op2) >>> 0, this.c ? 1 : 0); break;
          case 'RSB': res = add(op2, (~a) >>> 0, 1); break;
          case 'RSC': res = add(op2, (~a) >>> 0, this.c ? 1 : 0); break;
          case 'CMP': res = add(a, (~op2) >>> 0, 1); wr = false; break;
          case 'CMN': res = add(a, op2, 0); wr = false; break;
        }
        if (i.s) {
          this.n = (res >>> 31) === 1;
          this.z = res === 0;
          if (logical) this.c = sc; else { this.c = cOut; this.v = vOut; }
          if (i.rd === 15 && wr) { /* MOVS PC — mode return; treat as plain branch */ }
        }
        if (wr) {
          this.setReg(i.rd, res);
          if (i.rd === 15) { this.cycles += 2; return res & ~3; }
        }
        return null;
      }
      case 'mul': {
        const m = Math.imul(this.r[i.rm], this.r[i.rs]) >>> 0;
        const res = i.mn === 'MLA' ? (m + this.r[i.rn]) >>> 0 : m;
        this.setReg(i.rd, res);
        this.cycles += 2;
        if (i.s) { this.n = (res >>> 31) === 1; this.z = res === 0; }
        return null;
      }
      case 'mull': {
        const signed = i.mn.startsWith('S');
        const x = signed ? BigInt(this.r[i.rm] | 0) : BigInt(this.r[i.rm]);
        const y = signed ? BigInt(this.r[i.rs] | 0) : BigInt(this.r[i.rs]);
        let p = x * y;
        if (i.mn.endsWith('AL')) p += (BigInt(this.r[i.rdhi]) << 32n) | BigInt(this.r[i.rdlo]);
        const u = BigInt.asUintN(64, p);
        const lo = Number(u & 0xffffffffn), hi = Number(u >> 32n);
        this.setReg(i.rdlo, lo); this.setReg(i.rdhi, hi);
        this.cycles += 3;
        if (i.s) { this.n = (hi >>> 31) === 1; this.z = lo === 0 && hi === 0; }
        return null;
      }
      case 'mem': {
        const base = this.rv(i.rn, pc);
        let off: number;
        if (i.off.kind === 'imm') off = i.off.value;
        else off = this.shifter(i.off.shift, this.r[i.off.rm], pc)[0];
        const target = (i.up ? base + off : base - off) >>> 0;
        const addr = i.pre ? target : base;
        this.cycles += 2;
        if (i.load) {
          let v: number;
          switch (i.size) {
            case 'W': v = this.read32(addr); break;
            case 'B': v = this.read8(addr); break;
            case 'H': v = this.read16(addr); break;
            case 'SB': v = (this.read8(addr) << 24 >> 24) >>> 0; break;
            case 'SH': v = (this.read16(addr) << 16 >> 16) >>> 0; break;
          }
          if (i.wb && i.rn !== i.rd) this.setReg(i.rn, target);
          this.setReg(i.rd, v);
          if (i.rd === 15) return v & ~3;
        } else {
          const v = i.rd === 15 ? pc + 12 : this.r[i.rd];
          switch (i.size) {
            case 'W': this.write32(addr, v); break;
            case 'B': this.write8(addr, v); break;
            default: this.write16(addr, v); break;
          }
          if (i.wb) this.setReg(i.rn, target);
        }
        return null;
      }
      case 'block': {
        const n = i.regs.length;
        const base = this.r[i.rn];
        let start: number;
        switch (i.mode) {
          case 'IA': start = base; break;
          case 'IB': start = base + 4; break;
          case 'DA': start = base - 4 * n + 4; break;
          case 'DB': start = base - 4 * n; break;
        }
        const newBase = (i.mode === 'IA' || i.mode === 'IB') ? base + 4 * n : base - 4 * n;
        let a = start >>> 0;
        let branch: number | null = null;
        this.cycles += n + 1;
        if (i.load) {
          const vals: number[] = [];
          for (let k = 0; k < n; k++) { vals.push(this.read32(a)); a += 4; }
          if (i.wb) this.setReg(i.rn, newBase);
          i.regs.forEach((r, k) => { this.setReg(r, vals[k]); if (r === 15) branch = vals[k] & ~3; });
          if (i.regs.includes(15)) this.callDepth = Math.max(0, this.callDepth - 1);
        } else {
          for (const r of i.regs) { this.write32(a, r === 15 ? pc + 12 : this.r[r]); a += 4; }
          if (i.wb) this.setReg(i.rn, newBase);
        }
        if (i.rn === 13 && ((this.r[13] >>> 0) < DATA_BASE || this.r[13] > RAM_END)) throw new Error(`Stack pointer moved outside RAM (SP = 0x${hex8(this.r[13])})`);
        return branch;
      }
      case 'b':
        this.cycles += 2;
        if (i.link) { this.setReg(14, pc + 4); this.callDepth++; }
        return i.target;
      case 'bx': {
        const t = this.r[i.rm];
        if (t & 1) throw new Error('BX to an odd address would switch to Thumb state, which is not simulated');
        this.cycles += 2;
        if (i.rm === 14) this.callDepth = Math.max(0, this.callDepth - 1);
        this.changedRegs.add(15);
        return t & ~3;
      }
      case 'swp': {
        const addr = this.r[i.rn];
        if (i.byte) { const old = this.read8(addr); this.write8(addr, this.r[i.rm]); this.setReg(i.rd, old); }
        else { const old = this.read32(addr); this.write32(addr, this.r[i.rm]); this.setReg(i.rd, old); }
        return null;
      }
      case 'swi':
        this.halted = true;
        this.haltMsg = `Program stopped by SWI 0x${i.imm.toString(16).toUpperCase()}.`;
        return pc;
      case 'mrs': this.setReg(i.rd, this.cpsr()); return null;
      case 'msr': {
        const v = i.src.kind === 'imm' ? immValue(i.src.rot, i.src.imm8) : this.r[i.src.rm];
        this.n = (v >>> 31) === 1; this.z = ((v >>> 30) & 1) === 1; this.c = ((v >>> 29) & 1) === 1; this.v = ((v >>> 28) & 1) === 1;
        return null;
      }
      case 'nop': return null;
    }
  }
}

export function hex8(v: number) { return (v >>> 0).toString(16).toUpperCase().padStart(8, '0'); }
