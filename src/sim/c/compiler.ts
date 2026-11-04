import { CError } from './lexer';
import { preprocess } from './preprocess';
import { Decl, Expr, FuncDef, Program, Stmt, parse } from './parser';
import {
  CType, MK, T, arithResult, decay, isArith, isFloat, isInt, isPtr, isScalar, memKind, promote, ptr, sizeOf, alignOf, typeName,
} from './types';
import { Cvt, FuncInfo, Op, RAM_BASE, RAM_SIZE } from './vm';
import { BUILTINS, BUILTIN_INDEX } from './builtins';

export interface CompileOutput {
  code: Int32Array;
  consts: Float64Array;
  funcs: FuncInfo[];
  funcIndex: Map<string, number>;
  lines: { file: string; line: number }[];
  rom: Uint8Array;
  ramInit: Uint8Array;
  globalsEnd: number;
  entry: number;
  globals: { name: string; addr: number; type: CType }[];
  warnings: Diagnostic[];
  stats: { codeWords: number; ramBytes: number; romBytes: number };
}

export interface Diagnostic { file: string; line: number; col?: number; msg: string; severity: 'error' | 'warning' }

type Sym =
  | { kind: 'local'; off: number; type: CType; assigned?: boolean; name?: string; warned?: boolean }
  | { kind: 'global'; addr: number; type: CType }
  | { kind: 'func'; index: number; type: Extract<CType, { k: 'func' }> }
  | { kind: 'const'; value: number };

interface Label { pos: number; refs: number[] }

const ROM_STR_BASE = 0x00002000;

export function compileProject(files: Record<string, string>): CompileOutput {
  const cFiles = Object.keys(files).filter(f => /\.c$/i.test(f));
  if (!cFiles.length) throw new CError('The project has no .c file', '', 0);
  const progs: Program[] = [];
  const warnings: Diagnostic[] = [];
  for (const f of cFiles) {
    const pp = preprocess(files, f);
    for (const w of pp.warnings) warnings.push({ ...w, severity: 'warning' });
    progs.push(parse(pp.tokens));
  }
  // merge translation units
  const merged: Program = { funcs: [], globals: [], protos: new Map(), enumConsts: new Map() };
  for (const p of progs) {
    for (const fn of p.funcs) {
      const dup = merged.funcs.find(x => x.name === fn.name);
      if (dup) throw new CError(`Function '${fn.name}' is defined more than once (also at ${dup.file}:${dup.line})`, fn.file, fn.line);
      merged.funcs.push(fn);
    }
    for (const g of p.globals) merged.globals.push(g);
    for (const [k, v] of p.protos) merged.protos.set(k, v);
    for (const [k, v] of p.enumConsts) merged.enumConsts.set(k, v);
  }
  return new Compiler(merged, warnings).run();
}

class Compiler {
  code: number[] = [];
  consts: number[] = [];
  constMap = new Map<number, number>();
  lines: { file: string; line: number }[] = [];
  lineMap = new Map<string, number>();
  globals = new Map<string, Sym>();
  globalList: { name: string; addr: number; type: CType }[] = [];
  scopes: Map<string, Sym>[] = [];
  ram = new Uint8Array(RAM_SIZE);
  ramDv = new DataView(this.ram.buffer);
  ramTop = RAM_BASE;
  rom = new Uint8Array(0x10000);
  romTop = ROM_STR_BASE;
  strMap = new Map<string, number>();
  funcs: FuncInfo[] = [];
  funcIndex = new Map<string, number>();
  frameTop = 0;
  frameMax = 0;
  curFn: FuncDef | null = null;
  breakStack: Label[] = [];
  contStack: Label[] = [];
  gotoLabels = new Map<string, Label>();
  caseLabels = new Map<Stmt, Label>();
  staticCounter = 0;
  usedFuncs = new Set<string>();

  constructor(public prog: Program, public warnings: Diagnostic[]) {}

  err(msg: string, at: { file: string; line: number }): never { throw new CError(msg, at.file, at.line); }
  warn(msg: string, at: { file: string; line: number }) { this.warnings.push({ file: at.file, line: at.line, msg, severity: 'warning' }); }

  run(): CompileOutput {
    const prog = this.prog;
    for (const [k, v] of prog.enumConsts) this.globals.set(k, { kind: 'const', value: v });
    // function table
    prog.funcs.forEach((f, i) => {
      this.funcIndex.set(f.name, i);
      this.globals.set(f.name, { kind: 'func', index: i, type: f.type });
      this.funcs.push({ name: f.name, entry: -1, frameSize: 0, params: [], returnsValue: f.type.ret.k !== 'void', file: f.file, line: f.line, endLine: f.endLine });
    });
    // implicit device globals
    this.defineGlobal({ name: 'SystemCoreClock', type: T.uint, init: { t: 'num', v: 100000000, type: T.uint, line: 0, file: '' }, storage: null, line: 0, file: '<builtin>' });
    // globals: definitions win over extern declarations
    const seen = new Map<string, Decl>();
    for (const g of prog.globals) {
      const prev = seen.get(g.name);
      if (prev) {
        if (g.storage === 'extern') continue;
        if (prev.storage !== 'extern' && prev.init && g.init) this.err(`Global '${g.name}' is defined twice`, g);
        if (!g.init && prev.storage !== 'extern') continue;
      }
      seen.set(g.name, g);
    }
    for (const g of seen.values()) {
      if (g.name === 'SystemCoreClock') continue;
      if (g.storage === 'extern' && !prog.globals.some(x => x.name === g.name && x.storage !== 'extern')) {
        // extern without a definition anywhere — still give it storage (common in student code)
      }
      this.defineGlobal(g);
    }
    if (!this.funcIndex.has('main')) {
      throw new CError("No 'main' function found. Every program needs an int main(void).", Object.keys(prog.funcs)[0] ?? '', 1);
    }
    for (let i = 0; i < prog.funcs.length; i++) this.compileFunc(prog.funcs[i], i);
    this.emit(Op.HALT);
    // unused-function check is not needed; check calls to undefined funcs happened during compile
    const romUsed = this.romTop;
    return {
      code: Int32Array.from(this.code),
      consts: Float64Array.from(this.consts),
      funcs: this.funcs,
      funcIndex: this.funcIndex,
      lines: this.lines,
      rom: this.rom,
      ramInit: this.ram,
      globalsEnd: this.ramTop,
      entry: this.funcIndex.get('main')!,
      globals: this.globalList,
      warnings: this.warnings,
      stats: { codeWords: this.code.length, ramBytes: this.ramTop - RAM_BASE, romBytes: romUsed - ROM_STR_BASE + this.code.length * 2 },
    };
  }

  // ---------- emit helpers ----------
  emit(...ws: number[]) { for (const w of ws) this.code.push(w); }
  constIdx(v: number): number {
    const key = Object.is(v, -0) ? -0.0000000001234 : v;
    let i = this.constMap.get(key);
    if (i === undefined) { i = this.consts.length; this.consts.push(v); this.constMap.set(key, i); }
    return i;
  }
  pushNum(v: number) {
    if (Number.isInteger(v) && v >= -0x80000000 && v <= 0x7fffffff) this.emit(Op.PUSH, v);
    else this.emit(Op.PUSHF, this.constIdx(v));
  }
  newLabel(): Label { return { pos: -1, refs: [] }; }
  place(l: Label) { l.pos = this.code.length; for (const r of l.refs) this.code[r] = l.pos; }
  jump(op: Op, l: Label) {
    this.emit(op);
    if (l.pos >= 0) this.emit(l.pos);
    else { l.refs.push(this.code.length); this.emit(-1); }
  }
  stmtMark(at: { file: string; line: number }) {
    const key = at.file + ':' + at.line;
    let i = this.lineMap.get(key);
    if (i === undefined) { i = this.lines.length; this.lines.push({ file: at.file, line: at.line }); this.lineMap.set(key, i); }
    this.emit(Op.STMT, i);
  }

  // ---------- storage ----------
  allocRam(size: number, align: number, at: { file: string; line: number }): number {
    this.ramTop = Math.ceil(this.ramTop / align) * align;
    const a = this.ramTop;
    this.ramTop += size;
    if (this.ramTop > RAM_BASE + RAM_SIZE - 1024) this.err(`Out of RAM: global data needs more than ${RAM_SIZE - 1024} bytes`, at);
    return a;
  }

  romString(s: string): number {
    const hit = this.strMap.get(s);
    if (hit !== undefined) return hit;
    const a = this.romTop;
    if (a + s.length + 1 > this.rom.length) {
      const bigger = new Uint8Array(this.rom.length * 2); bigger.set(this.rom); this.rom = bigger;
    }
    for (let i = 0; i < s.length; i++) this.rom[a - 0 + i] = s.charCodeAt(i) & 0xff;
    this.rom[a + s.length] = 0;
    this.romTop += s.length + 1;
    this.strMap.set(s, a);
    return a;
  }

  defineGlobal(g: Decl) {
    if (g.type.k === 'void') this.err(`Variable '${g.name}' declared void`, g);
    if (g.type.k === 'arr' && g.type.len === null) this.err(`Array '${g.name}' needs a size`, g);
    if (g.type.k === 'struct' && !g.type.fields) this.err(`Struct '${g.type.name}' is incomplete`, g);
    const size = Math.max(1, sizeOf(g.type));
    const addr = this.allocRam(size, alignOf(g.type), g);
    this.globals.set(g.name, { kind: 'global', addr, type: g.type });
    this.globalList.push({ name: g.name, addr, type: g.type });
    if (g.init) this.staticInit(addr, g.type, g.init);
  }

  staticInit(addr: number, type: CType, init: Expr) {
    const o = addr - RAM_BASE;
    if (type.k === 'arr' && init.t === 'init' && init.items.length === 1 && init.items[0].t === 'str') init = init.items[0];
    if (type.k === 'arr') {
      if (init.t === 'str' && type.of.k === 'int' && type.of.size === 1) {
        const n = type.len ?? init.v.length + 1;
        if (init.v.length > n) this.warn(`String is longer than array '${typeName(type)}'`, init);
        for (let i = 0; i < Math.min(n, init.v.length); i++) this.ram[o + i] = init.v.charCodeAt(i) & 0xff;
        return;
      }
      if (init.t !== 'init') this.err('Array initializer must be a { list }', init);
      const es = sizeOf(type.of);
      if (type.len !== null && init.items.length > type.len) this.err(`Too many initializers for array of ${type.len}`, init);
      init.items.forEach((it, i) => this.staticInit(addr + i * es, type.of, it));
      return;
    }
    if (type.k === 'struct') {
      if (init.t !== 'init') this.err('Struct initializer must be a { list }', init);
      const fs = type.fields!;
      init.items.forEach((it, i) => { if (fs[i]) this.staticInit(addr + fs[i].offset, fs[i].type, it); });
      return;
    }
    let e = init;
    if (e.t === 'init') { if (!e.items.length) return; e = e.items[0]; }
    const v = this.constValue(e);
    this.storeConst(o, type, v);
  }

  storeConst(o: number, type: CType, v: number) {
    const dv = this.ramDv;
    switch (memKind(type)) {
      case MK.I8: case MK.U8: dv.setUint8(o, v & 0xff); break;
      case MK.I16: case MK.U16: dv.setUint16(o, v & 0xffff, true); break;
      case MK.I32: case MK.U32: dv.setUint32(o, Number.isInteger(v) ? v >>> 0 : Math.trunc(v) >>> 0, true); break;
      case MK.F32: dv.setFloat32(o, v, true); break;
      case MK.F64: dv.setFloat64(o, v, true); break;
    }
  }

  constValue(e: Expr): number {
    switch (e.t) {
      case 'num': return e.v;
      case 'str': return this.romString(e.v);
      case 'id': {
        const s = this.lookup(e.name);
        if (s?.kind === 'const') return s.value;
        if (s?.kind === 'global' && (s.type.k === 'arr')) return s.addr;
        break;
      }
      case 'un': {
        if (e.op === '&' && e.a.t === 'id') { const s = this.lookup(e.a.name); if (s?.kind === 'global') return s.addr; }
        const v = this.constValue(e.a);
        if (e.op === '-') return -v; if (e.op === '+') return v; if (e.op === '~') return ~v; if (e.op === '!') return v ? 0 : 1;
        break;
      }
      case 'cast': {
        const v = this.constValue(e.a);
        if (isInt(e.type)) {
          const t = e.type as any;
          let r = Math.trunc(v);
          if (t.size === 1) r = t.signed ? (r << 24) >> 24 : r & 0xff;
          else if (t.size === 2) r = t.signed ? (r << 16) >> 16 : r & 0xffff;
          else if (t.size === 4) r = t.signed ? r | 0 : r >>> 0;
          return r;
        }
        if (isPtr(e.type)) return v >>> 0;
        return v;
      }
      case 'sizeof_t': return sizeOf(e.type);
      case 'sizeof_e': return sizeOf(this.typeOf(e.a));
      case 'bin': {
        const a = this.constValue(e.a), b = this.constValue(e.b);
        switch (e.op) {
          case '+': return a + b; case '-': return a - b; case '*': return a * b;
          case '/': return Number.isInteger(a) && Number.isInteger(b) ? Math.trunc(a / b) : a / b;
          case '%': return a % b;
          case '<<': return (a << b) >>> 0; case '>>': return a >>> 0 >>> b;
          case '&': return (a & b) >>> 0; case '|': return (a | b) >>> 0; case '^': return (a ^ b) >>> 0;
          case '<': return +(a < b); case '>': return +(a > b); case '<=': return +(a <= b); case '>=': return +(a >= b);
          case '==': return +(a === b); case '!=': return +(a !== b);
          case '&&': return +(a && b); case '||': return +(a || b);
        }
        break;
      }
      case 'cond': return this.constValue(e.c) ? this.constValue(e.a) : this.constValue(e.b);
    }
    this.err('Global initializer must be a constant expression', e);
  }

  lookup(name: string): Sym | undefined {
    for (let i = this.scopes.length - 1; i >= 0; i--) { const s = this.scopes[i].get(name); if (s) return s; }
    return this.globals.get(name);
  }

  allocLocal(type: CType): number {
    const a = alignOf(type);
    this.frameTop = Math.ceil(this.frameTop / a) * a;
    const off = this.frameTop;
    this.frameTop += Math.max(1, sizeOf(type));
    this.frameMax = Math.max(this.frameMax, this.frameTop);
    return off;
  }

  // ---------- functions ----------
  compileFunc(f: FuncDef, index: number) {
    this.curFn = f;
    this.frameTop = 0;
    this.frameMax = 0;
    this.scopes = [new Map()];
    this.gotoLabels = new Map();
    const info = this.funcs[index];
    info.entry = this.code.length;
    for (const p of f.params) {
      if (p.type.k === 'void') continue;
      const off = this.allocLocal(p.type);
      this.scopes[0].set(p.name, { kind: 'local', off, type: p.type });
      info.params.push({ off, mk: memKind(p.type) });
    }
    this.stmt(f.body);
    // implicit return at end
    this.stmtMark({ file: f.file, line: f.endLine });
    if (f.type.ret.k !== 'void') { this.emit(Op.PUSH, 0); this.emit(Op.RETV); }
    else this.emit(Op.RET);
    for (const [name, l] of this.gotoLabels) if (l.pos < 0) this.err(`Label '${name}' used but not defined`, f);
    info.frameSize = Math.ceil(this.frameMax / 8) * 8 + 8;
    this.curFn = null;
  }

  // ---------- statements ----------
  stmt(s: Stmt) {
    switch (s.t) {
      case 'block': {
        this.scopes.push(new Map());
        const saved = this.frameTop;
        for (const x of s.body) this.stmt(x);
        this.frameTop = saved;
        this.scopes.pop();
        return;
      }
      case 'empty': return;
      case 'expr': this.stmtMark(s); this.expr(s.e, true); return;
      case 'decl': for (const d of s.decls) this.localDecl(d); return;
      case 'if': {
        this.stmtMark(s);
        const Lelse = this.newLabel(), Lend = this.newLabel();
        this.cond(s.c, Lelse, false);
        this.stmt(s.a);
        if (s.b) { this.jump(Op.JMP, Lend); this.place(Lelse); this.stmt(s.b); this.place(Lend); }
        else this.place(Lelse);
        return;
      }
      case 'while': {
        const Ltop = this.newLabel(), Lend = this.newLabel();
        this.place(Ltop);
        this.stmtMark(s);
        this.cond(s.c, Lend, false);
        this.breakStack.push(Lend); this.contStack.push(Ltop);
        this.stmt(s.body);
        this.breakStack.pop(); this.contStack.pop();
        this.jump(Op.JMP, Ltop);
        this.place(Lend);
        return;
      }
      case 'do': {
        const Ltop = this.newLabel(), Lcont = this.newLabel(), Lend = this.newLabel();
        this.place(Ltop);
        this.breakStack.push(Lend); this.contStack.push(Lcont);
        this.stmt(s.body);
        this.breakStack.pop(); this.contStack.pop();
        this.place(Lcont);
        this.stmtMark(s.c);
        this.cond(s.c, Ltop, true);
        this.place(Lend);
        return;
      }
      case 'for': {
        this.scopes.push(new Map());
        const saved = this.frameTop;
        if (s.init) this.stmt(s.init);
        const Ltop = this.newLabel(), Lcont = this.newLabel(), Lend = this.newLabel();
        this.place(Ltop);
        this.stmtMark(s);
        if (s.c) this.cond(s.c, Lend, false);
        this.breakStack.push(Lend); this.contStack.push(Lcont);
        this.stmt(s.body);
        this.breakStack.pop(); this.contStack.pop();
        this.place(Lcont);
        if (s.step) this.expr(s.step, true);
        this.jump(Op.JMP, Ltop);
        this.place(Lend);
        this.frameTop = saved;
        this.scopes.pop();
        return;
      }
      case 'return': {
        this.stmtMark(s);
        const rt = this.curFn!.type.ret;
        if (s.e) {
          if (rt.k === 'void') {
            this.warn(`'return' with a value in void function '${this.curFn!.name}'`, s);
            this.expr(s.e, true);
            this.emit(Op.RET);
          } else {
            const t = this.expr(s.e);
            this.convert(t, rt, s.e);
            this.emit(Op.RETV);
          }
        } else {
          if (rt.k !== 'void') { this.emit(Op.PUSH, 0); this.emit(Op.RETV); }
          else this.emit(Op.RET);
        }
        return;
      }
      case 'break': {
        const l = this.breakStack[this.breakStack.length - 1];
        if (!l) this.err("'break' outside a loop or switch", s);
        this.jump(Op.JMP, l);
        return;
      }
      case 'continue': {
        const l = this.contStack[this.contStack.length - 1];
        if (!l) this.err("'continue' outside a loop", s);
        this.jump(Op.JMP, l);
        return;
      }
      case 'switch': {
        this.stmtMark(s);
        const t = this.expr(s.e);
        if (!isInt(t)) this.err('switch expression must be an integer', s.e);
        this.convert(t, promote(t), s.e);
        const tmp = this.allocLocal(T.int);
        this.emit(Op.LSTORE, MK.I32, tmp);
        const cases: Stmt[] = [];
        const collect = (x: Stmt) => {
          switch (x.t) {
            case 'case': case 'default': cases.push(x); break;
            case 'block': x.body.forEach(collect); break;
            case 'if': collect(x.a); if (x.b) collect(x.b); break;
            case 'while': case 'do': case 'for': collect(x.body); break;
          }
        };
        collect(s.body);
        const Lend = this.newLabel();
        let Ldef: Label | null = null;
        const seenVals = new Set<number>();
        for (const c of cases) {
          const L = this.newLabel();
          this.caseLabels.set(c, L);
          if (c.t === 'case') {
            const v = this.constValue(c.v) | 0;
            if (seenVals.has(v)) this.err(`Duplicate case value ${v}`, c);
            seenVals.add(v);
            this.emit(Op.LLOAD, MK.I32, tmp);
            this.emit(Op.PUSH, v);
            this.emit(Op.EQ);
            this.jump(Op.JNZ, L);
          } else Ldef = L;
        }
        this.jump(Op.JMP, Ldef ?? Lend);
        this.breakStack.push(Lend);
        this.stmt(s.body);
        this.breakStack.pop();
        this.place(Lend);
        return;
      }
      case 'case': case 'default': {
        const L = this.caseLabels.get(s);
        if (!L) this.err(`'${s.t}' outside of a switch`, s);
        this.place(L);
        return;
      }
      case 'label': {
        let l = this.gotoLabels.get(s.name);
        if (!l) { l = this.newLabel(); this.gotoLabels.set(s.name, l); }
        this.place(l);
        return;
      }
      case 'goto': {
        this.stmtMark(s);
        let l = this.gotoLabels.get(s.name);
        if (!l) { l = this.newLabel(); this.gotoLabels.set(s.name, l); }
        this.jump(Op.JMP, l);
        return;
      }
    }
  }

  localDecl(d: Decl) {
    if (d.type.k === 'void') this.err(`Variable '${d.name}' declared void`, d);
    if (d.type.k === 'func') { this.prog.protos.set(d.name, d.type as any); return; }
    if (d.storage === 'extern') return;
    if (d.storage === 'static') {
      const gname = `${this.curFn!.name}.${d.name}.${++this.staticCounter}`;
      this.defineGlobal({ ...d, name: gname });
      this.scopes[this.scopes.length - 1].set(d.name, this.globals.get(gname)!);
      return;
    }
    if (d.type.k === 'arr' && d.type.len === null) this.err(`Array '${d.name}' needs a size`, d);
    const off = this.allocLocal(d.type);
    this.scopes[this.scopes.length - 1].set(d.name, { kind: 'local', off, type: d.type, assigned: !!d.init || !isScalar(d.type), name: d.name });
    if (!d.init) return;
    this.stmtMark(d);
    this.localInit(off, d.type, d.init, d);
  }

  localInit(off: number, type: CType, init: Expr, at: { file: string; line: number }) {
    if (type.k === 'arr' && init.t === 'init' && init.items.length === 1 && init.items[0].t === 'str') init = init.items[0];
    if (type.k === 'arr') {
      const total = sizeOf(type);
      if (init.t === 'str' && type.of.k === 'int' && type.of.size === 1) {
        const n = type.len!;
        if (init.v.length > n) this.warn(`String "${init.v}" (${init.v.length} chars) does not fit in ${n} bytes`, at);
        else if (init.v.length === n) this.warn(`Array of ${n} has no room for the terminating '\\0' of "${init.v}"`, at);
        this.emit(Op.LADDR, off); this.emit(Op.MEMZERO, total);
        for (let i = 0; i < Math.min(n, init.v.length); i++) { this.emit(Op.PUSH, init.v.charCodeAt(i) & 0xff); this.emit(Op.LSTORE, MK.U8, off + i); }
        return;
      }
      if (init.t !== 'init') this.err('Array initializer must be a { list }', init);
      if (init.items.length > type.len!) this.err(`Too many initializers for array of ${type.len}`, init);
      this.emit(Op.LADDR, off); this.emit(Op.MEMZERO, total);
      const es = sizeOf(type.of);
      init.items.forEach((it, i) => this.localInit(off + i * es, type.of, it, at));
      return;
    }
    if (type.k === 'struct') {
      if (init.t === 'init') {
        this.emit(Op.LADDR, off); this.emit(Op.MEMZERO, sizeOf(type));
        init.items.forEach((it, i) => { const f = type.fields![i]; if (f) this.localInit(off + f.offset, f.type, it, at); });
      } else {
        this.emit(Op.LADDR, off);
        const t = this.expr(init);
        if (t.k !== 'struct') this.err('Incompatible struct initializer', init);
        this.emit(Op.MEMCPY, sizeOf(type));
      }
      return;
    }
    let e = init;
    if (e.t === 'init') e = e.items[0] ?? { t: 'num', v: 0, type: T.int, line: at.line, file: at.file };
    const t = this.expr(e);
    this.convert(t, type, e);
    this.emit(Op.LSTORE, memKind(type), off);
  }

  // ---------- conditions ----------
  /** Jump to label when truthiness of e equals jumpIf. */
  cond(e: Expr, l: Label, jumpIf: boolean) {
    if (e.t === 'bin' && e.op === '&&') {
      if (!jumpIf) { this.cond(e.a, l, false); this.cond(e.b, l, false); }
      else { const skip = this.newLabel(); this.cond(e.a, skip, false); this.cond(e.b, l, true); this.place(skip); }
      return;
    }
    if (e.t === 'bin' && e.op === '||') {
      if (jumpIf) { this.cond(e.a, l, true); this.cond(e.b, l, true); }
      else { const skip = this.newLabel(); this.cond(e.a, skip, true); this.cond(e.b, l, false); this.place(skip); }
      return;
    }
    if (e.t === 'un' && e.op === '!') { this.cond(e.a, l, !jumpIf); return; }
    if (e.t === 'num') {
      if ((e.v !== 0) === jumpIf) this.jump(Op.JMP, l);
      return;
    }
    if (e.t === 'assign' && e.op === '=') {
      // "if (x = 5)" — legal, but almost always a typo for ==
      if (this.curFn) this.warn("Assignment used as a condition — did you mean '=='?", e);
    }
    const t = this.expr(e);
    if (t.k === 'struct') this.err('Struct used as a condition', e);
    this.jump(jumpIf ? Op.JNZ : Op.JZ, l);
  }

  // ---------- types of expressions (without emitting) ----------
  typeOf(e: Expr): CType {
    const saveLen = this.code.length;
    const saveWarn = this.warnings.length;
    const t = this.exprRaw(e);
    this.code.length = saveLen;
    this.warnings.length = saveWarn;
    return t;
  }

  // ---------- conversion ----------
  convert(from: CType, to: CType, at: { file: string; line: number }) {
    if (to.k === 'void') { return; }
    if (from.k === 'arr' || from.k === 'func') from = decay(from);
    if (to.k === 'struct' || from.k === 'struct') {
      if (to.k === 'struct' && from.k === 'struct' && (to === from || to.name === from.name)) return;
      this.err(`Cannot convert '${typeName(from)}' to '${typeName(to)}'`, at);
    }
    if (from.k === 'void') this.err('void value used in an expression', at);
    const tk = to.k === 'enum' ? T.int : to;
    const fk = from.k === 'enum' ? T.int : from;
    if (tk.k === 'int' && tk.bool) { this.emit(Op.CVT, Cvt.BOOL); return; }
    if (tk.k === 'int') {
      if (fk.k === 'float') {
        if (tk.size === 8) { this.emit(Op.CVT, Cvt.TRUNC); return; }
        if (tk.size === 4 && !tk.signed) { this.emit(Op.CVT, Cvt.F2U32); return; }
        this.emit(Op.CVT, Cvt.F2I32);
        this.narrow(tk.size, tk.signed);
        return;
      }
      if (fk.k === 'int') {
        if (tk.size === 8) return;
        if (fk.size === 8) { this.emit(Op.CVT, tk.signed ? Cvt.I32 : Cvt.U32); this.narrow(tk.size, tk.signed); return; }
        if (tk.size === 4) {
          if (tk.signed && !fk.signed && fk.size === 4) this.emit(Op.CVT, Cvt.I32);
          else if (!tk.signed && (fk.signed)) this.emit(Op.CVT, Cvt.U32);
          return;
        }
        // narrowing / sign change in small types
        const fits = fk.size < tk.size ? (tk.signed || !fk.signed) : (fk.size === tk.size && fk.signed === tk.signed);
        if (!fits) this.narrow(tk.size, tk.signed);
        return;
      }
      if (fk.k === 'ptr') { if (tk.size < 4) this.narrow(tk.size, tk.signed); else if (tk.signed) this.emit(Op.CVT, Cvt.I32); return; }
    }
    if (tk.k === 'float') {
      if (tk.size === 4 && !(fk.k === 'float' && fk.size === 4)) this.emit(Op.CVT, Cvt.F32);
      if (fk.k === 'ptr') this.err('Cannot convert a pointer to float', at);
      return;
    }
    if (tk.k === 'ptr') {
      if (fk.k === 'float') this.err('Cannot convert float to a pointer', at);
      if (fk.k === 'int' && fk.signed) this.emit(Op.CVT, Cvt.U32);
      return;
    }
  }
  narrow(size: number, signed: boolean) {
    if (size === 1) this.emit(Op.CVT, signed ? Cvt.I8 : Cvt.U8);
    else if (size === 2) this.emit(Op.CVT, signed ? Cvt.I16 : Cvt.U16);
    else if (size === 4) this.emit(Op.CVT, signed ? Cvt.I32 : Cvt.U32);
  }

  // ---------- lvalues ----------
  /** Resolve lvalue; for 'addr' kind the address is emitted on the stack. */
  lval(e: Expr): { kind: 'local'; off: number; type: CType } | { kind: 'global'; addr: number; type: CType } | { kind: 'addr'; type: CType } {
    switch (e.t) {
      case 'id': {
        const s = this.lookup(e.name);
        if (!s) this.undeclared(e.name, e);
        if (s.kind === 'local') return { kind: 'local', off: s.off, type: s.type };
        if (s.kind === 'global') return { kind: 'global', addr: s.addr, type: s.type };
        this.err(`'${e.name}' is not a variable`, e);
      }
      // falls through (unreachable)
      case 'un':
        if (e.op === '*') {
          const t = decay(this.expr(e.a));
          if (t.k !== 'ptr') this.err(`Cannot dereference a non-pointer ('${typeName(t)}')`, e);
          if (t.to.k === 'void') this.err('Dereferencing a void pointer — cast it first', e);
          return { kind: 'addr', type: t.to };
        }
        break;
      case 'idx': {
        let ta = this.typeOf(e.a);
        let base = e.a, index = e.i;
        if (!(ta.k === 'ptr' || ta.k === 'arr')) { base = e.i; index = e.a; ta = this.typeOf(base); }
        const t = decay(this.expr(base));
        if (t.k !== 'ptr') this.err(`Subscripted value is not an array or pointer`, e);
        const it = this.expr(index);
        if (!isInt(it)) this.err('Array index must be an integer', index);
        const es = sizeOf(t.to);
        if (es !== 1) { this.pushNum(es); this.emit(Op.IMUL); }
        this.emit(Op.UADD);
        return { kind: 'addr', type: t.to };
      }
      case 'mem': {
        let st: CType;
        if (e.arrow) {
          const t = decay(this.expr(e.a));
          if (t.k !== 'ptr' || t.to.k !== 'struct') {
            if (t.k === 'struct') this.err(`Use '.' instead of '->' — '${this.exprText(e.a)}' is a struct, not a pointer`, e);
            this.err(`'->' used on something that is not a struct pointer`, e);
          }
          st = t.to;
        } else {
          const lv = this.lval(e.a);
          if (lv.type.k !== 'struct') {
            if (lv.type.k === 'ptr' && lv.type.to.k === 'struct') this.err(`Use '->' instead of '.' — '${this.exprText(e.a)}' is a pointer`, e);
            this.err(`Member access on a non-struct`, e);
          }
          this.lvAddr(lv);
          st = lv.type;
        }
        if (st.k !== 'struct') this.err('Member access on a non-struct', e);
        if (!st.fields) this.err(`Struct '${st.name}' is incomplete`, e);
        const f = st.fields.find(x => x.name === e.name);
        if (!f) {
          const near = st.fields.filter(x => !x.name.startsWith('RESERVED')).map(x => x.name);
          const sugg = near.find(n => n.toLowerCase() === e.name.toLowerCase());
          this.err(`'${e.name}' is not a member of ${st.name.startsWith('<') ? 'this struct' : st.name}${sugg ? ` — did you mean '${sugg}'?` : ''}`, e);
        }
        if (f.offset) { this.emit(Op.PUSH, f.offset); this.emit(Op.UADD); }
        return { kind: 'addr', type: f.type };
      }
      case 'str': {
        const a = this.romString(e.v);
        this.emit(Op.PUSH, a);
        return { kind: 'addr', type: { k: 'arr', of: T.char, len: e.v.length + 1 } };
      }
    }
    this.err('Expression is not assignable (not an lvalue)', e);
  }

  lvAddr(lv: ReturnType<Compiler['lval']>) {
    if (lv.kind === 'local') this.emit(Op.LADDR, lv.off);
    else if (lv.kind === 'global') this.emit(Op.PUSH, lv.addr | 0);
  }

  lvLoad(lv: ReturnType<Compiler['lval']>) {
    const mk = memKind(lv.type);
    if (lv.kind === 'local') this.emit(Op.LLOAD, mk, lv.off);
    else if (lv.kind === 'global') this.emit(Op.GLOAD, mk, lv.addr | 0);
    else this.emit(Op.LOAD, mk);
  }

  undeclared(name: string, at: { file: string; line: number }): never {
    const cands = [...this.globals.keys(), ...this.scopes.flatMap(s => [...s.keys()])];
    const lower = name.toLowerCase();
    const sugg = cands.find(c => c.toLowerCase() === lower && c !== name);
    let hint = sugg ? ` — did you mean '${sugg}'? (C is case-sensitive)` : '';
    if (!hint && /^LPC_/.test(name)) hint = ' — did you #include <LPC17xx.h>?';
    this.err(`'${name}' is undeclared${hint}`, at);
  }

  exprText(e: Expr): string {
    if (e.t === 'id') return e.name;
    if (e.t === 'mem') return this.exprText(e.a) + (e.arrow ? '->' : '.') + e.name;
    return 'expression';
  }

  // ---------- expressions ----------
  expr(e: Expr, discard = false): CType {
    const t = this.exprRaw(e, discard);
    if (discard && t.k !== 'void' && !(t as any).__discarded) this.emit(Op.POP);
    return t;
  }

  private DISCARDED: CType = { k: 'void' };

  exprRaw(e: Expr, discard = false): CType {
    switch (e.t) {
      case 'num':
        this.pushNum(e.v);
        return e.type;
      case 'str':
        this.emit(Op.PUSH, this.romString(e.v));
        return ptr(T.char);
      case 'id': {
        const s = this.lookup(e.name);
        if (!s) {
          if (BUILTIN_INDEX.has(e.name) || this.prog.protos.has(e.name)) this.err(`'${e.name}' used without calling it — add ()`, e);
          this.undeclared(e.name, e);
        }
        if (s.kind === 'const') { this.emit(Op.PUSH, s.value); return T.int; }
        if (s.kind === 'func') { this.emit(Op.PUSH, s.index); return ptr(s.type); }
        if (s.type.k === 'arr' || s.type.k === 'struct') {
          if (s.kind === 'local') this.emit(Op.LADDR, s.off); else this.emit(Op.PUSH, s.addr | 0);
          return s.type.k === 'arr' ? ptr(s.type.of) : s.type; // struct values are represented by address
        }
        if (s.kind === 'local') this.checkInit(s, e);
        this.lvLoad(s.kind === 'local' ? { kind: 'local', off: s.off, type: s.type } : { kind: 'global', addr: s.addr, type: s.type });
        return s.type;
      }
      case 'cast': {
        const t = this.expr(e.a);
        if (e.type.k === 'void') { this.emit(Op.POP); this.emit(Op.PUSH, 0); return T.void; }
        this.convert(t, e.type, e);
        return e.type;
      }
      case 'sizeof_t': this.emit(Op.PUSH, sizeOf(e.type)); return T.uint;
      case 'sizeof_e': {
        const t = e.a.t === 'id' ? (() => { const s = this.lookup(e.a.name); return s && (s.kind === 'local' || s.kind === 'global') ? s.type : this.typeOf(e.a); })() : e.a.t === 'str' ? { k: 'arr', of: T.char, len: e.a.v.length + 1 } as CType : this.typeOfObj(e.a);
        this.emit(Op.PUSH, sizeOf(t));
        return T.uint;
      }
      case 'comma': this.expr(e.a, true); return this.exprRaw(e.b, discard);
      case 'un': return this.unary(e);
      case 'bin': return this.binary(e);
      case 'assign': return this.assign(e, discard);
      case 'pre': case 'post': return this.incdec(e, discard);
      case 'cond': {
        const ta = this.typeOf(e.a), tb = this.typeOf(e.b);
        let rt: CType;
        if (isArith(ta) && isArith(tb)) rt = arithResult(ta, tb);
        else if (decay(ta).k === 'ptr') rt = decay(ta);
        else if (decay(tb).k === 'ptr') rt = decay(tb);
        else rt = ta;
        const Lelse = this.newLabel(), Lend = this.newLabel();
        this.cond(e.c, Lelse, false);
        const t1 = this.expr(e.a); if (rt.k !== 'void') this.convert(t1, rt, e.a);
        this.jump(Op.JMP, Lend);
        this.place(Lelse);
        const t2 = this.expr(e.b); if (rt.k !== 'void') this.convert(t2, rt, e.b);
        this.place(Lend);
        return rt;
      }
      case 'call': return this.call(e, discard);
      case 'idx': case 'mem': {
        const lv = this.lval(e);
        if (lv.type.k === 'arr') return ptr(lv.type.of); // address already on stack
        if (lv.type.k === 'struct') return lv.type;
        this.lvLoad(lv);
        return lv.type;
      }
      case 'init': this.err('Initializer list is only allowed in a declaration', e);
    }
    this.err('Unsupported expression', e);
  }

  typeOfObj(e: Expr): CType {
    const saveLen = this.code.length;
    try {
      if (e.t === 'idx' || e.t === 'mem' || (e.t === 'un' && e.op === '*')) { const lv = this.lval(e); return lv.type; }
      return this.exprRaw(e);
    } finally { this.code.length = saveLen; }
  }

  unary(e: Extract<Expr, { t: 'un' }>): CType {
    switch (e.op) {
      case '&': {
        if (e.a.t === 'id') {
          const s = this.lookup(e.a.name);
          if (s?.kind === 'func') { this.emit(Op.PUSH, s.index); return ptr(s.type); }
        }
        this.markAssigned(e.a); // the address may be used to fill it in
        const lv = this.lval(e.a);
        this.lvAddr(lv);
        return ptr(lv.type);
      }
      case '*': {
        const lv = this.lval(e);
        if (lv.type.k === 'arr') return ptr(lv.type.of);
        if (lv.type.k === 'struct') return lv.type;
        this.lvLoad(lv);
        return lv.type;
      }
      case '-': {
        const t = promote(this.expr(e.a));
        if (!isArith(t)) this.err("Unary '-' needs a number", e);
        if (isFloat(t) || (t as any).size === 8) this.emit(Op.FNEG);
        else { this.emit(Op.NEG); if (!(t as any).signed) this.emit(Op.CVT, Cvt.U32); }
        return t;
      }
      case '+': { const t = promote(this.expr(e.a)); return t; }
      case '~': {
        const t = promote(this.expr(e.a));
        if (!isInt(t)) this.err("'~' needs an integer operand", e);
        this.emit(Op.BNOT);
        if (!(t as any).signed) this.emit(Op.CVT, Cvt.U32);
        return t;
      }
      case '!': {
        const t = this.expr(e.a);
        if (!isScalar(decay(t))) this.err("'!' needs a scalar operand", e);
        this.emit(Op.LNOT);
        return T.int;
      }
    }
    this.err(`Unknown unary operator '${e.op}'`, e);
  }

  arithOp(op: string, rt: CType, at: Expr) {
    const f = isFloat(rt) || (rt as any).size === 8;
    const u = !f && !(rt as any).signed;
    switch (op) {
      case '+': this.emit(f ? Op.FADD : u ? Op.UADD : Op.IADD); break;
      case '-': this.emit(f ? Op.FSUB : u ? Op.USUB : Op.ISUB); break;
      case '*': this.emit(f ? Op.FMUL : u ? Op.UMUL : Op.IMUL); break;
      case '/':
        this.emit(f ? Op.FDIV : u ? Op.UDIV : Op.IDIV);
        if (f && !isFloat(rt)) this.emit(Op.CVT, Cvt.TRUNC);
        break;
      case '%':
        if (isFloat(rt)) this.err("'%' needs integer operands (use fmod for floats)", at);
        this.emit(f ? Op.FMOD : u ? Op.UMOD : Op.IMOD); break;
      case '&': this.emit(Op.AND); if (u) this.emit(Op.CVT, Cvt.U32); break;
      case '|': this.emit(Op.OR); if (u) this.emit(Op.CVT, Cvt.U32); break;
      case '^': this.emit(Op.XOR); if (u) this.emit(Op.CVT, Cvt.U32); break;
      default: this.err(`Bad operator ${op}`, at);
    }
    if ((op === '&' || op === '|' || op === '^') && isFloat(rt)) this.err(`'${op}' needs integer operands`, at);
  }

  binary(e: Extract<Expr, { t: 'bin' }>): CType {
    const op = e.op;
    if (op === '&&' || op === '||') {
      const Lf = this.newLabel(), Le = this.newLabel();
      if (op === '&&') {
        this.cond(e, Lf, false);
        this.emit(Op.PUSH, 1); this.jump(Op.JMP, Le);
        this.place(Lf); this.emit(Op.PUSH, 0);
      } else {
        this.cond(e, Lf, true);
        this.emit(Op.PUSH, 0); this.jump(Op.JMP, Le);
        this.place(Lf); this.emit(Op.PUSH, 1);
      }
      this.place(Le);
      return T.int;
    }
    const ta0 = decay(this.typeOf(e.a));
    const tb0 = decay(this.typeOf(e.b));
    // pointer arithmetic
    if ((op === '+' || op === '-') && (ta0.k === 'ptr' || tb0.k === 'ptr')) {
      if (op === '-' && ta0.k === 'ptr' && tb0.k === 'ptr') {
        this.expr(e.a); this.expr(e.b);
        this.emit(Op.ISUB);
        const es = sizeOf(ta0.to);
        if (es > 1) { this.emit(Op.PUSH, es); this.emit(Op.IDIV); }
        return T.int;
      }
      const pFirst = ta0.k === 'ptr';
      const pt = (pFirst ? ta0 : tb0) as Extract<CType, { k: 'ptr' }>;
      const es = pt.to.k === 'void' ? 1 : sizeOf(pt.to);
      if (pFirst) {
        this.expr(e.a);
        const it = this.expr(e.b);
        if (!isInt(it)) this.err('Pointer arithmetic needs an integer', e.b);
        if (es !== 1) { this.pushNum(es); this.emit(Op.IMUL); }
      } else {
        const it = this.expr(e.a);
        if (!isInt(it)) this.err('Pointer arithmetic needs an integer', e.a);
        if (es !== 1) { this.pushNum(es); this.emit(Op.IMUL); }
        this.expr(e.b);
      }
      this.emit(op === '+' ? Op.UADD : Op.USUB);
      return pt;
    }
    if (op === '<<' || op === '>>') {
      const ta = promote(ta0);
      if (!isInt(ta) || !isInt(tb0)) this.err(`'${op}' needs integer operands`, e);
      this.expr(e.a); this.convert(ta0, ta, e.a);
      this.expr(e.b);
      if (op === '<<') { this.emit(Op.SHL); if (!(ta as any).signed) this.emit(Op.CVT, Cvt.U32); }
      else this.emit((ta as any).signed ? Op.SAR : Op.SHR);
      return ta;
    }
    const cmp = ['==', '!=', '<', '>', '<=', '>='].includes(op);
    if (cmp && (ta0.k === 'ptr' || tb0.k === 'ptr')) {
      this.expr(e.a); if (ta0.k !== 'ptr') this.convert(ta0, T.uint, e.a);
      this.expr(e.b); if (tb0.k !== 'ptr') this.convert(tb0, T.uint, e.b);
      this.emitCmp(op);
      return T.int;
    }
    if (!isArith(ta0) || !isArith(tb0)) {
      this.err(`Invalid operands to '${op}' ('${typeName(ta0)}' and '${typeName(tb0)}')`, e);
    }
    const rt = arithResult(ta0, tb0);
    // literal compare warnings for unsigned char vs negative etc. are skipped
    this.expr(e.a); this.convert(ta0, rt, e.a);
    this.expr(e.b); this.convert(tb0, rt, e.b);
    if (cmp) { this.emitCmp(op); return T.int; }
    this.arithOp(op, rt, e);
    return rt;
  }

  emitCmp(op: string) {
    switch (op) {
      case '==': this.emit(Op.EQ); break; case '!=': this.emit(Op.NE); break;
      case '<': this.emit(Op.LT); break; case '>': this.emit(Op.GT); break;
      case '<=': this.emit(Op.LE); break; case '>=': this.emit(Op.GE); break;
    }
  }

  assign(e: Extract<Expr, { t: 'assign' }>, discard: boolean): CType {
    // struct assignment
    const lt0 = this.typeOfObjLv(e.a);
    if (lt0 && lt0.k === 'struct') {
      if (e.op !== '=') this.err('Compound assignment on a struct', e);
      const lv = this.lval(e.a); this.lvAddr(lv);
      const rt = this.expr(e.b);
      if (rt.k !== 'struct') this.err('Incompatible types in struct assignment', e);
      this.emit(Op.MEMCPY, sizeOf(lt0));
      return discard ? this.markDiscard() : (this.err('Struct assignment result used as value', e));
    }
    if (lt0 && lt0.k === 'arr') this.err('Arrays cannot be assigned — copy element by element (or use strcpy for strings)', e);
    const lv = this.lval(e.a);
    if (lv.type.k === 'func') this.err('Cannot assign to a function', e);
    const lt = lv.type;
    const mk = memKind(lt);
    if (e.op === '=') {
      if (lv.kind === 'addr') {
        const rt = this.expr(e.b);
        this.checkAssignTypes(lt, rt, e);
        this.convert(rt, lt, e.b);
        if (discard) { this.emit(Op.STORE_POP, mk); return this.markDiscard(); }
        this.emit(Op.STORE, mk);
        return lt;
      }
      const rt = this.expr(e.b);
      this.checkAssignTypes(lt, rt, e);
      this.convert(rt, lt, e.b);
      this.markAssigned(e.a);
      if (!discard) this.emit(Op.DUP);
      if (lv.kind === 'local') this.emit(Op.LSTORE, mk, lv.off); else this.emit(Op.GSTORE, mk, lv.addr | 0);
      return discard ? this.markDiscard() : lt;
    }
    // compound: reads the old value first
    this.checkInitExpr(e.a);
    this.markAssigned(e.a);
    const bop = e.op.slice(0, -1);
    if (lv.kind === 'addr') this.emit(Op.DUP);
    this.lvLoad(lv);
    const rt0 = decay(this.typeOf(e.b));
    if (lt.k === 'ptr' && (bop === '+' || bop === '-')) {
      const it = this.expr(e.b);
      if (!isInt(it)) this.err('Pointer arithmetic needs an integer', e.b);
      const es = sizeOf(lt.to);
      if (es !== 1) { this.pushNum(es); this.emit(Op.IMUL); }
      this.emit(bop === '+' ? Op.UADD : Op.USUB);
    } else if (bop === '<<' || bop === '>>') {
      const pt = promote(lt);
      this.convert(lt, pt, e);
      this.expr(e.b);
      if (bop === '<<') { this.emit(Op.SHL); if (!(pt as any).signed) this.emit(Op.CVT, Cvt.U32); }
      else this.emit((pt as any).signed ? Op.SAR : Op.SHR);
      this.convert(pt, lt, e);
    } else {
      if (!isArith(lt) || !isArith(rt0)) this.err(`Invalid operands to '${e.op}'`, e);
      const rt = arithResult(lt, rt0);
      this.convert(lt, rt, e);
      this.expr(e.b); this.convert(rt0, rt, e.b);
      this.arithOp(bop, rt, e);
      this.convert(rt, lt, e);
    }
    if (lv.kind === 'addr') {
      if (discard) { this.emit(Op.STORE_POP, mk); return this.markDiscard(); }
      this.emit(Op.STORE, mk); return lt;
    }
    if (!discard) this.emit(Op.DUP);
    if (lv.kind === 'local') this.emit(Op.LSTORE, mk, lv.off); else this.emit(Op.GSTORE, mk, lv.addr | 0);
    return discard ? this.markDiscard() : lt;
  }

  checkAssignTypes(lt: CType, rt: CType, at: { file: string; line: number }) {
    const r = decay(rt);
    if (lt.k === 'ptr' && isFloat(r)) this.err('Assigning a float to a pointer', at);
    if (isArith(lt) && r.k === 'ptr' && (lt as any).size < 4) this.warn('Assigning a pointer to a small integer', at);
  }

  typeOfObjLv(e: Expr): CType | null {
    if (e.t === 'id') { const s = this.lookup(e.name); if (s && (s.kind === 'local' || s.kind === 'global')) return s.type; return null; }
    if (e.t === 'idx' || e.t === 'mem' || (e.t === 'un' && e.op === '*')) return this.typeOfObj(e);
    return null;
  }

  /** Warn once when a local scalar is read before anything is stored in it. */
  checkInit(s: Sym, at: { file: string; line: number }) {
    if (s.kind !== 'local' || s.assigned !== false || s.warned) return;
    s.warned = true;
    this.warn(`'${s.name}' is used before it is given a value. On the real board it starts with whatever was left in memory, so initialise it (e.g. ${s.name} = 0).`, at);
  }
  checkInitExpr(e: Expr) {
    if (e.t !== 'id') return;
    const s = this.lookup(e.name);
    if (s) this.checkInit(s, e);
  }
  markAssigned(e: Expr) {
    if (e.t !== 'id') return;
    const s = this.lookup(e.name);
    if (s && s.kind === 'local') s.assigned = true;
  }

  markDiscard(): CType { return { k: 'void', __discarded: true } as any; }

  incdec(e: Extract<Expr, { t: 'pre' | 'post' }>, discard: boolean): CType {
    this.checkInitExpr(e.a);
    this.markAssigned(e.a);
    const lv = this.lval(e.a);
    const t = lv.type;
    if (!isScalar(t)) this.err(`'${e.op}' needs a numeric or pointer variable`, e);
    const step = t.k === 'ptr' ? sizeOf(t.to) || 1 : 1;
    const delta = e.op === '++' ? step : -step;
    const mode = discard ? 2 : e.t === 'pre' ? 0 : 1;
    const mk = memKind(t);
    if (lv.kind === 'local') this.emit(Op.LINCDEC, mk, lv.off, this.constIdx(delta), mode);
    else if (lv.kind === 'global') this.emit(Op.GINCDEC, mk, lv.addr | 0, this.constIdx(delta), mode);
    else this.emit(Op.INCDEC, mk, this.constIdx(delta), mode);
    return discard ? this.markDiscard() : t;
  }

  call(e: Extract<Expr, { t: 'call' }>, discard: boolean): CType {
    if (e.f.t !== 'id') this.err('Only direct function calls are supported (no function pointers)', e);
    const name = e.f.name;
    const local = this.scopes.length ? this.scopes.some(s => s.has(name)) : false;
    const sym = local ? undefined : this.globals.get(name);
    if (sym && sym.kind === 'func') {
      const ft = sym.type;
      const fdef = this.prog.funcs[sym.index];
      const nparams = fdef.params.filter(p => p.type.k !== 'void').length;
      if (!ft.variadic && !ft.oldStyle && e.args.length !== nparams) {
        this.err(`Function '${name}' expects ${nparams} argument${nparams === 1 ? '' : 's'} but ${e.args.length} given`, e);
      }
      e.args.forEach((a, i) => {
        const at = this.expr(a);
        const pt = fdef.params[i]?.type;
        if (pt && pt.k !== 'void') this.convert(at, pt, a);
        else this.defaultPromote(at, a);
      });
      this.emit(Op.CALL, sym.index, e.args.length);
      if (ft.ret.k === 'void') {
        if (!discard) return T.void;
        return this.markDiscard();
      }
      return ft.ret;
    }
    const bi = BUILTIN_INDEX.get(name);
    if (bi !== undefined) {
      const b = BUILTINS[bi];
      if (b.params && !b.variadic && e.args.length !== b.params.length) {
        this.err(`'${name}' expects ${b.params.length} argument(s) but ${e.args.length} given`, e);
      }
      if (b.params && b.variadic && e.args.length < b.params.length) this.err(`Too few arguments to '${name}'`, e);
      e.args.forEach((a, i) => {
        const at = this.expr(a);
        const pt = b.params?.[i];
        if (pt) {
          if (pt.k === 'ptr' && !(decay(at).k === 'ptr' || isInt(at))) this.err(`Argument ${i + 1} of '${name}' must be a pointer`, a);
          this.convert(at, pt, a);
        } else this.defaultPromote(at, a);
      });
      this.emit(Op.CALLB, bi, e.args.length);
      if (b.ret.k === 'void') {
        this.emit(Op.POP);
        return discard ? this.markDiscard() : T.void;
      }
      return b.ret;
    }
    if (this.prog.protos.has(name)) {
      this.err(`Function '${name}' is declared but never defined. If it lives in another .c file, add that file to the project.`, e);
    }
    this.err(`Function '${name}' is not defined`, e);
  }

  defaultPromote(t: CType, at: Expr) {
    if (t.k === 'float' && t.size === 4) return; // already a JS double
    if (t.k === 'struct') this.err('Passing structs by value is not supported', at);
  }
}
