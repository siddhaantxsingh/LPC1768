// Two-pass assembler for ARM7TDMI (ARM state) programs written in Keil/armasm syntax.

export const CODE_BASE = 0x00000000;
export const DATA_BASE = 0x40000000;
export const RAM_END = 0x40008000;

export interface AsmDiag { line: number; msg: string; severity: 'error' | 'warning' }

export type Shift = { type: 'LSL' | 'LSR' | 'ASR' | 'ROR' | 'RRX'; amount: number; reg: number | null };
export type Operand2 =
  | { kind: 'imm'; value: number; rot: number; imm8: number }
  | { kind: 'reg'; rm: number; shift: Shift };

export type Instr =
  | { op: 'dp'; mn: string; cond: number; s: boolean; rd: number; rn: number; op2: Operand2 }
  | { op: 'mul'; mn: 'MUL' | 'MLA'; cond: number; s: boolean; rd: number; rm: number; rs: number; rn: number }
  | { op: 'mull'; mn: 'UMULL' | 'UMLAL' | 'SMULL' | 'SMLAL'; cond: number; s: boolean; rdlo: number; rdhi: number; rm: number; rs: number }
  | { op: 'mem'; load: boolean; size: 'W' | 'B' | 'H' | 'SB' | 'SH'; cond: number; rd: number; rn: number; pre: boolean; up: boolean; wb: boolean; off: { kind: 'imm'; value: number } | { kind: 'reg'; rm: number; shift: Shift }; literal?: number }
  | { op: 'block'; load: boolean; cond: number; rn: number; mode: 'IA' | 'IB' | 'DA' | 'DB'; wb: boolean; regs: number[]; user: boolean }
  | { op: 'b'; link: boolean; cond: number; target: number }
  | { op: 'bx'; cond: number; rm: number }
  | { op: 'swp'; cond: number; byte: boolean; rd: number; rm: number; rn: number }
  | { op: 'swi'; cond: number; imm: number }
  | { op: 'mrs'; cond: number; rd: number }
  | { op: 'msr'; cond: number; flagsOnly: boolean; src: Operand2 }
  | { op: 'nop'; cond: number };

export interface AsmLine { addr: number; line: number; size: number; kind: 'instr' | 'data' | 'pool'; word?: number; instr?: Instr; text: string }

export interface AsmResult {
  ok: boolean;
  diags: AsmDiag[];
  instrs: Map<number, { instr: Instr; line: number; word: number }>;
  memory: Map<number, number>;       // byte address -> byte (initial image)
  listing: AsmLine[];
  symbols: Map<string, { value: number; kind: 'code' | 'data' | 'equ' }>;
  entry: number;
  codeEnd: number;
  dataEnd: number;
  lineAddr: Map<number, number>;     // source line -> address of first instruction
}

export const CONDS = ['EQ', 'NE', 'CS', 'CC', 'MI', 'PL', 'VS', 'VC', 'HI', 'LS', 'GE', 'LT', 'GT', 'LE', 'AL'];
const COND_ALIAS: Record<string, number> = { HS: 2, LO: 3 };
const DP = ['AND', 'EOR', 'SUB', 'RSB', 'ADD', 'ADC', 'SBC', 'RSC', 'TST', 'TEQ', 'CMP', 'CMN', 'ORR', 'MOV', 'BIC', 'MVN'];
const DIRECTIVES = new Set(['AREA', 'ENTRY', 'END', 'EQU', 'DCD', 'DCDU', 'DCW', 'DCWU', 'DCB', 'SPACE', 'FILL', '%', 'ALIGN', 'EXPORT', 'IMPORT', 'GLOBAL', 'EXTERN', 'PRESERVE8', 'REQUIRE8', 'THUMB', 'ARM', 'CODE32', 'CODE16', 'LTORG', 'RN', 'INCLUDE', 'GET', 'KEEP', 'ROUT', 'EQU', '*']);
const BASES = ['UMULL', 'UMLAL', 'SMULL', 'SMLAL', 'MUL', 'MLA', 'LDR', 'STR', 'LDM', 'STM', 'BX', 'BL', 'B', 'SWP', 'SWI', 'SVC', 'NOP', 'ADR', 'MRS', 'MSR', 'PUSH', 'POP', 'LSL', 'LSR', 'ASR', 'ROR', 'RRX', ...DP];

export const REG_NAMES: Record<string, number> = {
  R0: 0, R1: 1, R2: 2, R3: 3, R4: 4, R5: 5, R6: 6, R7: 7, R8: 8, R9: 9, R10: 10, R11: 11, R12: 12, R13: 13, R14: 14, R15: 15,
  SP: 13, LR: 14, PC: 15, A1: 0, A2: 1, A3: 2, A4: 3, V1: 4, V2: 5, V3: 6, V4: 7, V5: 8, V6: 9, V7: 10, V8: 11, SB: 9, SL: 10, FP: 11, IP: 12,
};

class AsmError extends Error {}

interface Parsed { base: string; cond: number; s: boolean; suffix: string }

/** Split a mnemonic like MOVEQS / ADDSEQ / LDREQB / LDMFD into parts. */
export function parseMnemonic(raw: string): Parsed | null {
  const m = raw.toUpperCase();
  for (const base of BASES) {
    if (!m.startsWith(base)) continue;
    let rest = m.slice(base.length);
    // B/BL are prefixes of BIC/BX etc. — those are tried first only if they match fully
    let cond = 14, s = false, suffix = '';
    const takeCond = () => {
      const c2 = rest.slice(0, 2);
      const ci = CONDS.indexOf(c2);
      if (ci >= 0 && rest.length >= 2) { cond = ci; rest = rest.slice(2); return true; }
      if (c2 in COND_ALIAS) { cond = COND_ALIAS[c2]; rest = rest.slice(2); return true; }
      return false;
    };
    const sufList = base === 'LDR' || base === 'STR' ? ['SB', 'SH', 'BT', 'B', 'H', 'T'] : base === 'LDM' || base === 'STM' ? ['IA', 'IB', 'DA', 'DB', 'FD', 'ED', 'FA', 'EA'] : base === 'SWP' ? ['B'] : [];
    const takeSuf = () => {
      for (const sf of sufList) if (rest.startsWith(sf)) { suffix = sf; rest = rest.slice(sf.length); return true; }
      return false;
    };
    const canS = DP.includes(base) || ['MUL', 'MLA', 'UMULL', 'UMLAL', 'SMULL', 'SMLAL', 'LSL', 'LSR', 'ASR', 'ROR', 'RRX'].includes(base);
    // try orders: cond S | S cond | cond suffix | suffix cond
    const save = rest;
    const tryOrder = (order: string[]) => {
      rest = save; cond = 14; s = false; suffix = '';
      for (const o of order) {
        if (o === 'c') takeCond();
        if (o === 's' && canS && rest.startsWith('S')) { s = true; rest = rest.slice(1); }
        if (o === 'x') takeSuf();
      }
      return rest === '';
    };
    if (tryOrder(['c', 's', 'x']) || tryOrder(['s', 'c', 'x']) || tryOrder(['x', 'c', 's']) || tryOrder(['c', 'x', 's'])) {
      if ((base === 'LDM' || base === 'STM') && !suffix) suffix = 'IA';
      return { base, cond, s, suffix };
    }
  }
  return null;
}

function encodeImm(v: number): { rot: number; imm8: number } | null {
  v = v >>> 0;
  for (let rot = 0; rot < 16; rot++) {
    const r = ((v << (rot * 2)) | (v >>> (32 - rot * 2))) >>> 0;
    if (rot === 0 ? v <= 0xff : r <= 0xff) return { rot, imm8: rot === 0 ? v : r };
  }
  return null;
}

export function immValue(rot: number, imm8: number) {
  const s = rot * 2;
  return s === 0 ? imm8 : ((imm8 >>> s) | (imm8 << (32 - s))) >>> 0;
}

/** Split operands on commas outside brackets/braces/quotes. */
function splitOps(s: string): string[] {
  const out: string[] = [];
  let depth = 0, cur = '', q = '';
  for (const ch of s) {
    if (q) { cur += ch; if (ch === q) q = ''; continue; }
    if (ch === '"' || ch === "'") { q = ch; cur += ch; continue; }
    if (ch === '[' || ch === '{' || ch === '(') depth++;
    if (ch === ']' || ch === '}' || ch === ')') depth--;
    if (ch === ',' && depth === 0) { out.push(cur.trim()); cur = ''; continue; }
    cur += ch;
  }
  if (cur.trim().length) out.push(cur.trim());
  return out;
}

function stripComment(line: string): string {
  let q = '';
  for (let i = 0; i < line.length; i++) {
    const c = line[i];
    if (q) { if (c === q) q = ''; continue; }
    if (c === '"') { q = c; continue; }
    if (c === "'" && line[i + 2] === "'") { i += 2; continue; }
    if (c === ';') return line.slice(0, i);
  }
  return line;
}

interface Stmt { line: number; label: string | null; mn: string; args: string; raw: string }

export function assemble(source: string): AsmResult {
  const diags: AsmDiag[] = [];
  const symbols = new Map<string, { value: number; kind: 'code' | 'data' | 'equ' }>();
  const aliases = new Map<string, number>();
  const lines = source.replace(/\r\n?/g, '\n').split('\n');
  const stmts: Stmt[] = [];

  // ---------- tokenise lines ----------
  lines.forEach((raw0, i) => {
    const raw = raw0.replace(/\t/g, '    ');
    let text = stripComment(raw).replace(/\s+$/, '');
    if (!text.trim()) return;
    // smart quotes from PDFs
    text = text.replace(/[“”]/g, '"').replace(/[‘’]/g, "'").replace(/–|—/g, '-');
    const m = /^\s*([^\s,]+)(?:\s+(.*))?$/.exec(text);
    if (!m) return;
    let first = m[1];
    let rest = (m[2] ?? '').trim();
    let label: string | null = null;
    const firstUp = first.toUpperCase();
    const isKnown = DIRECTIVES.has(firstUp) || parseMnemonic(first) !== null;
    // "X EQU 5" / "X RN 3" style or label at line start
    if (!isKnown || (/^\S/.test(raw) && rest && /^(EQU|RN|DCD|DCDU|DCW|DCWU|DCB|SPACE|FILL|%|\*)\b/i.test(rest))) {
      label = first.replace(/:$/, '');
      const m2 = /^([^\s,]+)(?:\s+(.*))?$/.exec(rest);
      if (m2) { first = m2[1]; rest = (m2[2] ?? '').trim(); } else { first = ''; rest = ''; }
    }
    stmts.push({ line: i + 1, label, mn: first, args: rest, raw: raw0 });
  });

  // ---------- expression evaluation ----------
  const evalExpr = (expr: string, line: number, allowUndef = false): number | null => {
    const toks = expr.match(/0[xX][0-9a-fA-F]+|&[0-9a-fA-F]+|0[bB][01]+|2_[01]+|\d+|'(?:\\.|[^'])'|[A-Za-z_.$][A-Za-z0-9_.$]*|<<|>>|:AND:|:OR:|:EOR:|:SHL:|:SHR:|:NOT:|[-+*/()|&^~]/g);
    if (!toks) throw new AsmError(`Bad expression '${expr}'`);
    let p = 0;
    let undef = false;
    const prim = (): number => {
      const t = toks[p++];
      if (t === undefined) throw new AsmError(`Incomplete expression '${expr}'`);
      if (t === '(') { const v = sum(); if (toks[p++] !== ')') throw new AsmError(`Missing ')' in '${expr}'`); return v; }
      if (t === '-') return -prim();
      if (t === '+') return prim();
      if (t === '~' || t === ':NOT:') return ~prim();
      if (/^0[xX]/.test(t)) return parseInt(t.slice(2), 16);
      if (t[0] === '&') return parseInt(t.slice(1), 16);
      if (/^0[bB]/.test(t)) return parseInt(t.slice(2), 2);
      if (/^2_/.test(t)) return parseInt(t.slice(2), 2);
      if (/^\d/.test(t)) return parseInt(t, 10);
      if (t[0] === "'") { const c = t.slice(1, -1); return c[0] === '\\' ? ({ n: 10, t: 9, r: 13, '0': 0 } as any)[c[1]] ?? c.charCodeAt(1) : c.charCodeAt(0); }
      if (t === '{PC}' || t === '.') return curAddr;
      const sym = symbols.get(t);
      if (sym) return sym.value;
      if (!allowUndef) {
        const ci = [...symbols.keys()].find(k => k.toUpperCase() === t.toUpperCase());
        throw new AsmError(`Undefined symbol '${t}'${ci ? ` — did you mean '${ci}'? (labels are case-sensitive)` : ''}`);
      }
      undef = true;
      return 0;
    };
    const prod = (): number => {
      let v = prim();
      while (toks[p] === '*' || toks[p] === '/' || toks[p] === '<<' || toks[p] === '>>' || toks[p] === ':SHL:' || toks[p] === ':SHR:') {
        const o = toks[p++]; const r = prim();
        v = o === '*' ? Math.imul(v, r) : o === '/' ? Math.trunc(v / r) : (o === '<<' || o === ':SHL:') ? v << r : v >>> r;
      }
      return v;
    };
    const sum = (): number => {
      let v = prod();
      while (['+', '-', '|', '&', '^', ':AND:', ':OR:', ':EOR:'].includes(toks[p])) {
        const o = toks[p++]; const r = prod();
        v = o === '+' ? v + r : o === '-' ? v - r : (o === '|' || o === ':OR:') ? v | r : (o === '&' || o === ':AND:') ? v & r : v ^ r;
      }
      return v;
    };
    const v = sum();
    if (p < toks.length) throw new AsmError(`Unexpected '${toks[p]}' in expression '${expr}'`);
    void line;
    return undef ? null : (v >>> 0);
  };

  const reg = (s: string): number => {
    const u = s.trim().toUpperCase();
    if (u in REG_NAMES) return REG_NAMES[u];
    if (aliases.has(s.trim())) return aliases.get(s.trim())!;
    if (/^R\d+$/.test(u)) throw new AsmError(`'${s}' is not a register (R0–R15)`);
    throw new AsmError(`Expected a register, found '${s}'`);
  };

  const parseShift = (s: string): Shift => {
    const m = /^(LSL|LSR|ASR|ROR|ASL)\s*(#?)\s*(.+)$/i.exec(s.trim());
    if (/^RRX$/i.test(s.trim())) return { type: 'RRX', amount: 0, reg: null };
    if (!m) throw new AsmError(`Bad shift '${s}'`);
    let type = m[1].toUpperCase() as Shift['type'] | 'ASL';
    if (type === 'ASL') type = 'LSL';
    if (m[2] === '#') {
      const v = evalExpr(m[3], 0)!;
      const max = type === 'LSL' ? 31 : 32;
      if (v > max || (v === 0 && type !== 'LSL')) throw new AsmError(`Shift amount #${v} out of range for ${type} (${type === 'LSL' ? '0–31' : '1–32'})`);
      return { type: type as Shift['type'], amount: v, reg: null };
    }
    return { type: type as Shift['type'], amount: 0, reg: reg(m[3]) };
  };

  const parseOp2 = (ops: string[], mn: string, allowFix: boolean): Operand2 => {
    const a = ops[0];
    if (a.startsWith('#')) {
      const v = evalExpr(a.slice(1), 0)!;
      const e = encodeImm(v);
      if (!e) {
        if (allowFix) throw new AsmError(`FIX:${v}`);
        throw new AsmError(`Immediate 0x${(v >>> 0).toString(16).toUpperCase()} cannot be encoded: ARM immediates are an 8-bit value rotated by an even amount. Use LDR Rd, =0x${(v >>> 0).toString(16).toUpperCase()} instead.`);
      }
      return { kind: 'imm', value: v >>> 0, rot: e.rot, imm8: e.imm8 };
    }
    const rm = reg(a);
    const shift: Shift = ops[1] ? parseShift(ops[1]) : { type: 'LSL', amount: 0, reg: null };
    void mn;
    return { kind: 'reg', rm, shift };
  };

  // ---------- pass 1: layout ----------
  type Area = { name: string; code: boolean; addr: number; pool: { value: number; label: string | null; addr: number }[] };
  let area: Area | null = null;
  let curAddr = 0;
  let codeTop = CODE_BASE, dataTop = DATA_BASE;
  const layout: { st: Stmt; addr: number; size: number; area: Area }[] = [];
  const pools: Area[] = [];
  const labelArea = new Map<string, Area>();
  let ended = false;
  const ensureArea = (st: Stmt) => {
    if (!area) {
      diags.push({ line: st.line, msg: 'Code before any AREA directive — assuming a CODE area', severity: 'warning' });
      area = { name: 'CODE', code: true, addr: codeTop, pool: [] };
      pools.push(area);
      curAddr = codeTop;
    }
    return area;
  };
  const closeArea = () => {
    if (!area) return;
    if (area.code && area.pool.length) {
      curAddr = Math.ceil(curAddr / 4) * 4;
      for (const pe of area.pool) { pe.addr = curAddr; curAddr += 4; }
    }
    if (area.code) codeTop = Math.max(codeTop, curAddr); else dataTop = Math.max(dataTop, curAddr);
  };
  const dataItems = (args: string): string[] => splitOps(args);
  const sizeOfData = (mn: string, args: string): number => {
    const items = dataItems(args);
    if (mn === 'DCB') {
      let n = 0;
      for (const it of items) {
        if (it.startsWith('"')) n += unquote(it).length; else n += 1;
      }
      return n;
    }
    return items.length * (mn.startsWith('DCD') ? 4 : 2);
  };

  for (const st of stmts) {
    if (ended) { diags.push({ line: st.line, msg: 'Text after END is ignored', severity: 'warning' }); break; }
    const mnU = st.mn.toUpperCase();
    try {
      if (mnU === 'AREA') {
        closeArea();
        const parts = splitOps(st.args);
        const isCode = parts.slice(1).some(p => /^CODE$/i.test(p.trim())) || !parts.slice(1).some(p => /^DATA$/i.test(p.trim()));
        area = { name: parts[0] ?? '', code: isCode, addr: isCode ? codeTop : dataTop, pool: [] };
        pools.push(area);
        curAddr = area.addr;
        if (st.label) diags.push({ line: st.line, msg: `Label '${st.label}' on an AREA line is ignored`, severity: 'warning' });
        continue;
      }
      if (mnU === 'END') { closeArea(); area = null; ended = true; continue; }
      if (mnU === 'EQU' || mnU === '*') {
        if (!st.label) throw new AsmError('EQU needs a name: NAME EQU value');
        const v = evalExpr(st.args, st.line, true);
        symbols.set(st.label, { value: v ?? 0, kind: 'equ' });
        continue;
      }
      if (mnU === 'RN') { if (st.label) aliases.set(st.label, reg(st.args)); continue; }
      if (['ENTRY', 'EXPORT', 'IMPORT', 'GLOBAL', 'EXTERN', 'PRESERVE8', 'REQUIRE8', 'THUMB', 'ARM', 'CODE32', 'KEEP', 'INCLUDE', 'GET', 'ROUT', 'CODE16'].includes(mnU)) {
        if (mnU === 'THUMB' || mnU === 'CODE16') diags.push({ line: st.line, msg: 'Thumb code is not simulated; assembling as ARM', severity: 'warning' });
        if (st.label) { const a = ensureArea(st); symbols.set(st.label, { value: curAddr, kind: a.code ? 'code' : 'data' }); }
        continue;
      }
      const a = ensureArea(st);
      // alignment for data directives
      if (mnU === 'DCD' || mnU === 'DCW') {
        const al = mnU === 'DCD' ? 4 : 2;
        curAddr = Math.ceil(curAddr / al) * al;
      }
      if (mnU === 'ALIGN') {
        const al = st.args ? (evalExpr(st.args, st.line) ?? 4) : 4;
        curAddr = Math.ceil(curAddr / al) * al;
        if (st.label) symbols.set(st.label, { value: curAddr, kind: a.code ? 'code' : 'data' });
        continue;
      }
      if (st.label) {
        if (symbols.has(st.label) && symbols.get(st.label)!.kind !== 'equ') throw new AsmError(`Label '${st.label}' is defined twice`);
        symbols.set(st.label, { value: curAddr, kind: a.code ? 'code' : 'data' });
        labelArea.set(st.label, a);
      }
      if (!st.mn) continue;
      let size = 0;
      if (mnU === 'LTORG') {
        curAddr = Math.ceil(curAddr / 4) * 4;
        for (const pe of a.pool) if (pe.addr < 0) { pe.addr = curAddr; curAddr += 4; }
        continue;
      }
      if (['DCD', 'DCDU', 'DCW', 'DCWU', 'DCB'].includes(mnU)) size = sizeOfData(mnU, st.args);
      else if (mnU === 'SPACE' || mnU === '%' || mnU === 'FILL') size = evalExpr(splitOps(st.args)[0], st.line) ?? 0;
      else {
        if (curAddr % 4) curAddr = Math.ceil(curAddr / 4) * 4;
        size = 4;
        if (!a.code) diags.push({ line: st.line, msg: 'Instruction placed in a DATA area', severity: 'warning' });
      }
      layout.push({ st, addr: curAddr, size, area: a });
      curAddr += size;
    } catch (e) {
      if (e instanceof AsmError) diags.push({ line: st.line, msg: e.message, severity: 'error' });
      else throw e;
    }
  }
  if (!ended) { closeArea(); diags.push({ line: lines.length, msg: "Missing END directive at the end of the file", severity: 'warning' }); }

  // literal pool sizes were unknown in pass 1: give every LDR =x a slot, then lay pools out per area
  // (simple approach: pools go after each area's last item; recompute addresses)
  // Re-run layout adjustments: collect literal requests
  const litReq = new Map<Stmt, Area>();
  for (const it of layout) {
    if (/^LDR/i.test(it.st.mn) && /,\s*=/.test(it.st.args)) litReq.set(it.st, it.area);
  }
  // Pool placement: per area, at its end (after closeArea). Compute end addresses per area.
  const areaEnd = new Map<Area, number>();
  for (const it of layout) areaEnd.set(it.area, Math.max(areaEnd.get(it.area) ?? it.area.addr, it.addr + it.size));
  // If code areas are followed by more code areas, shift later items to make room for pools.
  // Determine pool contents (dedupe by expression text) in pass 1.5
  const poolEntries = new Map<Area, { key: string; addr: number }[]>();
  for (const [st, a] of litReq) {
    const expr = st.args.split('=').slice(1).join('=').trim();
    let v: number | null = null;
    try { v = evalExpr(expr, st.line, true); } catch { v = null; }
    if (v !== null && (encodeImm(v) || encodeImm(~v >>> 0))) continue; // becomes MOV/MVN
    const list = poolEntries.get(a) ?? [];
    const key = v !== null ? 'v' + v : 'e' + expr;
    if (!list.some(x => x.key === key)) list.push({ key, addr: 0 });
    poolEntries.set(a, list);
  }
  // shift: process areas in order, inserting pools
  let shift = 0;
  let lastCodeArea: Area | null = null;
  const areaShift = new Map<Area, number>();
  for (const a of pools) {
    if (a.code) {
      areaShift.set(a, shift);
      const end = (areaEnd.get(a) ?? a.addr) + shift;
      const list = poolEntries.get(a) ?? [];
      let addr = Math.ceil(end / 4) * 4;
      for (const pe of list) { pe.addr = addr; addr += 4; }
      shift += addr - end;
      lastCodeArea = a;
    } else areaShift.set(a, 0);
  }
  void lastCodeArea;
  for (const it of layout) {
    const sh = areaShift.get(it.area) ?? 0;
    if (sh) it.addr += sh;
  }
  for (const [name, a] of labelArea) {
    const sh = areaShift.get(a) ?? 0;
    const sym = symbols.get(name);
    if (sh && sym) sym.value += sh;
  }

  // ---------- pass 2: encode ----------
  const memory = new Map<number, number>();
  const instrs = new Map<number, { instr: Instr; line: number; word: number }>();
  const listing: AsmLine[] = [];
  const lineAddr = new Map<number, number>();
  const put = (addr: number, bytes: number[]) => bytes.forEach((b, i) => memory.set(addr + i, b & 0xff));
  const putWord = (addr: number, w: number) => put(addr, [w, w >>> 8, w >>> 16, w >>> 24]);
  let entry = -1;
  for (const st of stmts) if (st.mn.toUpperCase() === 'ENTRY') {
    const after = layout.find(it => it.st.line > st.line && it.area.code && it.size === 4 && !/^DC|SPACE|%/i.test(it.st.mn));
    if (after) entry = after.addr;
  }

  for (const it of layout) {
    const { st, addr } = it;
    curAddr = addr;
    const mnU = st.mn.toUpperCase();
    try {
      if (['DCD', 'DCDU', 'DCW', 'DCWU', 'DCB'].includes(mnU)) {
        const items = dataItems(st.args);
        const bytes: number[] = [];
        for (const x of items) {
          if (mnU === 'DCB') {
            if (x.startsWith('"')) { for (const ch of unquote(x)) bytes.push(ch.charCodeAt(0)); }
            else { const v = evalExpr(x, st.line)!; if ((v | 0) > 255 || (v | 0) < -128) diags.push({ line: st.line, msg: `DCB value ${v | 0} does not fit in a byte`, severity: 'warning' }); bytes.push(v & 0xff); }
          } else if (mnU.startsWith('DCW')) { const v = evalExpr(x, st.line)!; bytes.push(v & 0xff, (v >>> 8) & 0xff); }
          else { const v = evalExpr(x, st.line)!; bytes.push(v & 0xff, (v >>> 8) & 0xff, (v >>> 16) & 0xff, (v >>> 24) & 0xff); }
        }
        put(addr, bytes);
        listing.push({ addr, line: st.line, size: bytes.length, kind: 'data', text: st.raw });
        continue;
      }
      if (mnU === 'SPACE' || mnU === '%' || mnU === 'FILL') {
        const parts = splitOps(st.args);
        const fill = parts[1] ? evalExpr(parts[1], st.line)! & 0xff : 0;
        put(addr, new Array(it.size).fill(fill));
        listing.push({ addr, line: st.line, size: it.size, kind: 'data', text: st.raw });
        continue;
      }
      const instr = encodeInstr(st, addr, it.area);
      const word = encodeWord(instr, addr);
      putWord(addr, word);
      instrs.set(addr, { instr, line: st.line, word });
      if (!lineAddr.has(st.line)) lineAddr.set(st.line, addr);
      listing.push({ addr, line: st.line, size: 4, kind: 'instr', word, instr, text: st.raw });
    } catch (e) {
      if (e instanceof AsmError) diags.push({ line: st.line, msg: e.message, severity: 'error' });
      else throw e;
    }
  }
  // emit literal pools
  for (const [a, list] of poolEntries) {
    for (const pe of list) {
      const v = pe.key.startsWith('v') ? Number(pe.key.slice(1)) : (() => { try { return evalExpr(pe.key.slice(1), 0) ?? 0; } catch (e) { return 0; } })();
      putWord(pe.addr, v);
      listing.push({ addr: pe.addr, line: 0, size: 4, kind: 'pool', word: v >>> 0, text: `literal pool (${a.name})` });
    }
  }
  listing.sort((x, y) => x.addr - y.addr || x.line - y.line);
  if (entry < 0) {
    const firstCode = layout.find(it => it.area.code && instrs.has(it.addr));
    entry = firstCode ? firstCode.addr : CODE_BASE;
    if (stmts.length && !stmts.some(s => s.mn.toUpperCase() === 'ENTRY')) diags.push({ line: 1, msg: 'No ENTRY directive — execution starts at the first instruction', severity: 'warning' });
  }
  let codeEnd = CODE_BASE, dataEnd = DATA_BASE;
  for (const [addr] of memory) { if (addr < DATA_BASE) codeEnd = Math.max(codeEnd, addr + 1); else dataEnd = Math.max(dataEnd, addr + 1); }
  return { ok: !diags.some(d => d.severity === 'error'), diags, instrs, memory, listing, symbols, entry, codeEnd, dataEnd, lineAddr };

  // ---------- instruction encoder (structure) ----------
  function encodeInstr(st: Stmt, addr: number, a: Area): Instr {
    const pm = parseMnemonic(st.mn);
    if (!pm) throw new AsmError(`Unknown instruction '${st.mn}'`);
    const { base, cond, s, suffix } = pm;
    const ops = splitOps(st.args);
    const need = (n: number) => { if (ops.length < n) throw new AsmError(`${base} needs ${n} operand${n > 1 ? 's' : ''}`); };
    const di = DP.indexOf(base);
    if (di >= 0) {
      const isCmp = di >= 8 && di <= 11;
      const isMov = base === 'MOV' || base === 'MVN';
      if (isCmp) {
        need(2);
        let op2: Operand2;
        try { op2 = parseOp2(ops.slice(1), base, true); }
        catch (e) {
          const m = /^FIX:(\d+)$/.exec((e as Error).message);
          if (m && (base === 'CMP' || base === 'CMN')) {
            const v = Number(m[1]);
            const neg = (-v) >>> 0;
            const enc = encodeImm(neg);
            if (enc) return { op: 'dp', mn: base === 'CMP' ? 'CMN' : 'CMP', cond, s: true, rd: 0, rn: reg(ops[0]), op2: { kind: 'imm', value: neg, ...enc } };
          }
          if (m) throw new AsmError(`Immediate 0x${Number(m[1]).toString(16).toUpperCase()} cannot be encoded as an ARM immediate (8-bit value, even rotation). Load it into a register first.`);
          throw e;
        }
        return { op: 'dp', mn: base, cond, s: true, rd: 0, rn: reg(ops[0]), op2 };
      }
      if (isMov) {
        need(2);
        try { return { op: 'dp', mn: base, cond, s, rd: reg(ops[0]), rn: 0, op2: parseOp2(ops.slice(1), base, true) }; }
        catch (e) {
          const m = /^FIX:(\d+)$/.exec((e as Error).message);
          if (m) {
            const v = Number(m[1]);
            const inv = (~v) >>> 0;
            const enc = encodeImm(inv);
            if (enc) return { op: 'dp', mn: base === 'MOV' ? 'MVN' : 'MOV', cond, s, rd: reg(ops[0]), rn: 0, op2: { kind: 'imm', value: inv, ...enc } };
            throw new AsmError(`Immediate 0x${v.toString(16).toUpperCase()} cannot be encoded: ARM immediates are an 8-bit value rotated by an even number of bits. Use LDR ${ops[0]}, =0x${v.toString(16).toUpperCase()} instead.`);
          }
          throw e;
        }
      }
      // 2-operand shorthand: ADD R0, #1  => ADD R0, R0, #1
      const full = ops.length === 2 || (ops.length === 3 && /^(LSL|LSR|ASR|ROR|RRX)/i.test(ops[2])) ? [ops[0], ops[0], ...ops.slice(1)] : ops;
      if (full.length < 3) throw new AsmError(`${base} needs a destination and two operands`);
      try {
        return { op: 'dp', mn: base, cond, s, rd: reg(full[0]), rn: reg(full[1]), op2: parseOp2(full.slice(2), base, true) };
      } catch (e) {
        const m = /^FIX:(\d+)$/.exec((e as Error).message);
        if (m) {
          const v = Number(m[1]);
          const swaps: Record<string, string> = { ADD: 'SUB', SUB: 'ADD', ADC: 'SBC', SBC: 'ADC' };
          const swapsInv: Record<string, string> = { AND: 'BIC', BIC: 'AND' };
          if (swaps[base]) { const n = (-v) >>> 0; const enc = encodeImm(n); if (enc) return { op: 'dp', mn: swaps[base], cond, s, rd: reg(full[0]), rn: reg(full[1]), op2: { kind: 'imm', value: n, ...enc } }; }
          if (swapsInv[base]) { const n = (~v) >>> 0; const enc = encodeImm(n); if (enc) return { op: 'dp', mn: swapsInv[base], cond, s, rd: reg(full[0]), rn: reg(full[1]), op2: { kind: 'imm', value: n, ...enc } }; }
          throw new AsmError(`Immediate 0x${v.toString(16).toUpperCase()} cannot be encoded as an ARM immediate (8-bit value, even rotation). Load it into a register with LDR Rx, =0x${v.toString(16).toUpperCase()} first.`);
        }
        throw e;
      }
    }
    switch (base) {
      case 'LSL': case 'LSR': case 'ASR': case 'ROR': {
        need(2);
        const full = ops.length === 2 ? [ops[0], ops[0], ops[1]] : ops;
        const sh = full[2].startsWith('#') ? `${base} ${full[2]}` : `${base} ${full[2]}`;
        return { op: 'dp', mn: 'MOV', cond, s, rd: reg(full[0]), rn: 0, op2: { kind: 'reg', rm: reg(full[1]), shift: parseShift(sh) } };
      }
      case 'RRX': need(2); return { op: 'dp', mn: 'MOV', cond, s, rd: reg(ops[0]), rn: 0, op2: { kind: 'reg', rm: reg(ops[1]), shift: { type: 'RRX', amount: 0, reg: null } } };
      case 'MUL': {
        need(2);
        const full = ops.length === 2 ? [ops[0], ops[0], ops[1]] : ops;
        const rd = reg(full[0]), rm = reg(full[1]), rs = reg(full[2]);
        if (rd === 15 || rm === 15 || rs === 15) throw new AsmError('PC cannot be used in MUL');
        if (rd === rm) diags.push({ line: st.line, msg: 'MUL: Rd and Rm should be different registers on ARM7 (ARMv4) — result may be unpredictable on real hardware', severity: 'warning' });
        return { op: 'mul', mn: 'MUL', cond, s, rd, rm, rs, rn: 0 };
      }
      case 'MLA': {
        need(4);
        const rd = reg(ops[0]), rm = reg(ops[1]);
        if (rd === rm) diags.push({ line: st.line, msg: 'MLA: Rd and Rm should be different registers on ARM7 (ARMv4)', severity: 'warning' });
        return { op: 'mul', mn: 'MLA', cond, s, rd, rm, rs: reg(ops[2]), rn: reg(ops[3]) };
      }
      case 'UMULL': case 'UMLAL': case 'SMULL': case 'SMLAL': {
        need(4);
        const rdlo = reg(ops[0]), rdhi = reg(ops[1]);
        if (rdlo === rdhi) throw new AsmError(`${base}: RdLo and RdHi must be different registers`);
        return { op: 'mull', mn: base as any, cond, s, rdlo, rdhi, rm: reg(ops[2]), rs: reg(ops[3]) };
      }
      case 'LDR': case 'STR': {
        need(2);
        const load = base === 'LDR';
        const size = (suffix === 'B' || suffix === 'BT' ? 'B' : suffix === 'H' ? 'H' : suffix === 'SB' ? 'SB' : suffix === 'SH' ? 'SH' : 'W') as 'W' | 'B' | 'H' | 'SB' | 'SH';
        if (!load && (size === 'SB' || size === 'SH')) throw new AsmError(`STR${size} does not exist — use STR${size[1]}`);
        const rd = reg(ops[0]);
        const rest = st.args.slice(st.args.indexOf(',') + 1).trim();
        // literal: LDR Rd, =expr
        if (rest.startsWith('=')) {
          if (!load) throw new AsmError('STR cannot use =literal');
          const expr = rest.slice(1).trim();
          const v = evalExpr(expr, st.line);
          if (v === null) throw new AsmError(`Cannot evaluate '${expr}'`);
          const e1 = encodeImm(v);
          if (e1 && size === 'W') return { op: 'dp', mn: 'MOV', cond, s: false, rd, rn: 0, op2: { kind: 'imm', value: v, ...e1 } };
          const e2 = encodeImm((~v) >>> 0);
          if (e2 && size === 'W') return { op: 'dp', mn: 'MVN', cond, s: false, rd, rn: 0, op2: { kind: 'imm', value: (~v) >>> 0, ...e2 } };
          const list = poolEntries.get(a) ?? [];
          let pe = list.find(x => x.key === 'v' + v) ?? list.find(x => x.key === 'e' + expr);
          if (!pe) throw new AsmError('Internal: literal pool slot missing');
          const off = pe.addr - (addr + 8);
          return { op: 'mem', load: true, size, cond, rd, rn: 15, pre: true, up: off >= 0, wb: false, off: { kind: 'imm', value: Math.abs(off) }, literal: v };
        }
        // label: LDR Rd, label  (PC-relative)
        if (!rest.startsWith('[')) {
          const v = evalExpr(rest, st.line)!;
          const off = v - (addr + 8);
          if (Math.abs(off) > 4095) throw new AsmError(`Label '${rest}' is too far for PC-relative ${base} (use LDR Rx, =${rest} to load its address)`);
          return { op: 'mem', load, size, cond, rd, rn: 15, pre: true, up: off >= 0, wb: false, off: { kind: 'imm', value: Math.abs(off) } };
        }
        const m = /^\[([^\]]*)\](!?)\s*(?:,\s*(.*))?$/.exec(rest);
        if (!m) throw new AsmError(`Bad address '${rest}'`);
        const inner = splitOps(m[1]);
        const rn = reg(inner[0]);
        const post = m[3] !== undefined;
        const wb = m[2] === '!' || post;
        const offParts = post ? splitOps(m[3]) : inner.slice(1);
        if (post && inner.length > 1) throw new AsmError('Post-indexed address cannot also have a pre-index offset');
        const half = size === 'H' || size === 'SB' || size === 'SH';
        if (!offParts.length) return { op: 'mem', load, size, cond, rd, rn, pre: true, up: true, wb: m[2] === '!', off: { kind: 'imm', value: 0 } };
        const o = offParts[0];
        if (o.startsWith('#')) {
          const v = evalExpr(o.slice(1), st.line)! | 0;
          if (Math.abs(v) > (half ? 255 : 4095)) throw new AsmError(`Offset #${v} out of range (${half ? '±255' : '±4095'})`);
          return { op: 'mem', load, size, cond, rd, rn, pre: !post, up: v >= 0, wb, off: { kind: 'imm', value: Math.abs(v) } };
        }
        let up = true, rs = o;
        if (rs.startsWith('-')) { up = false; rs = rs.slice(1); } else if (rs.startsWith('+')) rs = rs.slice(1);
        const shift = offParts[1] ? parseShift(offParts[1]) : { type: 'LSL' as const, amount: 0, reg: null };
        if (shift.reg !== null) throw new AsmError('Register-specified shifts are not allowed in addresses');
        if (half && offParts[1]) throw new AsmError('Halfword/signed transfers cannot use a shifted register offset');
        if (wb && rn === rd && load) diags.push({ line: st.line, msg: 'Writeback to the same register being loaded is unpredictable', severity: 'warning' });
        return { op: 'mem', load, size, cond, rd, rn, pre: !post, up, wb, off: { kind: 'reg', rm: reg(rs), shift } };
      }
      case 'ADR': {
        need(2);
        const v = evalExpr(ops[1], st.line)!;
        const off = v - (addr + 8);
        const e = encodeImm(Math.abs(off));
        if (!e) throw new AsmError(`ADR target '${ops[1]}' out of range — use LDR ${ops[0]}, =${ops[1]}`);
        return { op: 'dp', mn: off >= 0 ? 'ADD' : 'SUB', cond, s: false, rd: reg(ops[0]), rn: 15, op2: { kind: 'imm', value: Math.abs(off), ...e } };
      }
      case 'LDM': case 'STM': case 'PUSH': case 'POP': {
        let load = base === 'LDM' || base === 'POP';
        let rnTxt: string, listTxt: string, wb: boolean, mode: 'IA' | 'IB' | 'DA' | 'DB';
        let user = false;
        if (base === 'PUSH' || base === 'POP') {
          rnTxt = 'SP'; listTxt = st.args.trim(); wb = true; mode = base === 'PUSH' ? 'DB' : 'IA';
        } else {
          const m = /^([^,!]+)(!?)\s*,\s*(\{.*\})\s*(\^?)$/.exec(st.args.trim());
          if (!m) throw new AsmError(`Expected ${base}${suffix} Rn{!}, {register list}`);
          rnTxt = m[1]; wb = m[2] === '!'; listTxt = m[3]; user = m[4] === '^';
          const stackMap: Record<string, [string, string]> = { FD: ['IA', 'DB'], ED: ['IB', 'DA'], FA: ['DA', 'IB'], EA: ['DB', 'IA'] };
          const sm = stackMap[suffix];
          mode = (sm ? (load ? sm[0] : sm[1]) : suffix) as any;
        }
        const lm = /^\{(.*)\}$/.exec(listTxt.trim());
        if (!lm) throw new AsmError('Register list must be in braces, e.g. {R0-R3, LR}');
        const regs = new Set<number>();
        for (const part of splitOps(lm[1])) {
          const r = /^(\w+)\s*-\s*(\w+)$/.exec(part);
          if (r) { const a1 = reg(r[1]), b1 = reg(r[2]); if (b1 < a1) throw new AsmError(`Bad register range ${part}`); for (let i = a1; i <= b1; i++) regs.add(i); }
          else regs.add(reg(part));
        }
        if (!regs.size) throw new AsmError('Empty register list');
        const rn = reg(rnTxt);
        if (rn === 15) throw new AsmError('PC cannot be the base register');
        if (wb && regs.has(rn) && load) diags.push({ line: st.line, msg: 'Base register in the list with writeback is unpredictable', severity: 'warning' });
        void load;
        return { op: 'block', load, cond, rn, mode, wb, regs: [...regs].sort((x, y) => x - y), user };
      }
      case 'B': case 'BL': {
        need(1);
        const t = evalExpr(ops[0], st.line)!;
        if (t % 4) throw new AsmError('Branch target is not word aligned');
        const target = symbols.get(ops[0].trim());
        if (target && target.kind === 'data') diags.push({ line: st.line, msg: `Branch to '${ops[0]}' which is in a DATA area`, severity: 'warning' });
        return { op: 'b', link: base === 'BL', cond, target: t };
      }
      case 'BX': need(1); return { op: 'bx', cond, rm: reg(ops[0]) };
      case 'SWP': {
        need(3);
        const mm = /^\[\s*(\w+)\s*\]$/.exec(ops[2]);
        if (!mm) throw new AsmError('SWP needs [Rn] as third operand');
        return { op: 'swp', cond, byte: suffix === 'B', rd: reg(ops[0]), rm: reg(ops[1]), rn: reg(mm[1]) };
      }
      case 'SWI': case 'SVC': return { op: 'swi', cond, imm: ops[0] ? (evalExpr(ops[0].replace(/^#/, ''), st.line) ?? 0) & 0xffffff : 0 };
      case 'NOP': return { op: 'nop', cond };
      case 'MRS': need(2); return { op: 'mrs', cond, rd: reg(ops[0]) };
      case 'MSR': {
        need(2);
        const flagsOnly = /_f$/i.test(ops[0]) || /_flg$/i.test(ops[0]);
        return { op: 'msr', cond, flagsOnly, src: parseOp2(ops.slice(1), 'MSR', false) };
      }
    }
    throw new AsmError(`Unsupported instruction '${st.mn}'`);
  }
}

function unquote(s: string): string {
  const m = /^"(.*)"$/.exec(s.trim());
  if (!m) return s;
  return m[1].replace(/\\n/g, '\n').replace(/\\t/g, '\t').replace(/\\0/g, '\0').replace(/\\"/g, '"').replace(/\\\\/g, '\\');
}

const SHIFT_CODE = { LSL: 0, LSR: 1, ASR: 2, ROR: 3, RRX: 3 };

/** Encode to a 32-bit ARM word (for the listing/disassembly column). */
export function encodeWord(i: Instr, addr: number): number {
  const c = (i as any).cond << 28;
  const shiftBits = (sh: Shift) => {
    if (sh.reg !== null) return (sh.reg << 8) | (SHIFT_CODE[sh.type] << 5) | (1 << 4);
    const amt = sh.type === 'RRX' ? 0 : sh.amount === 32 ? 0 : sh.amount;
    return (amt << 7) | (SHIFT_CODE[sh.type] << 5);
  };
  switch (i.op) {
    case 'dp': {
      const opc = DP.indexOf(i.mn);
      let w = c | (opc << 21) | ((i.s ? 1 : 0) << 20) | (i.rn << 16) | (i.rd << 12);
      if (i.op2.kind === 'imm') w |= (1 << 25) | (i.op2.rot << 8) | i.op2.imm8;
      else w |= shiftBits(i.op2.shift) | i.op2.rm;
      return w >>> 0;
    }
    case 'mul': return (c | ((i.mn === 'MLA' ? 1 : 0) << 21) | ((i.s ? 1 : 0) << 20) | (i.rd << 16) | (i.rn << 12) | (i.rs << 8) | 0x90 | i.rm) >>> 0;
    case 'mull': {
      const u = i.mn.startsWith('S') ? 1 : 0, acc = i.mn.endsWith('AL') ? 1 : 0;
      return (c | (1 << 23) | (u << 22) | (acc << 21) | ((i.s ? 1 : 0) << 20) | (i.rdhi << 16) | (i.rdlo << 12) | (i.rs << 8) | 0x90 | i.rm) >>> 0;
    }
    case 'mem': {
      if (i.size === 'W' || i.size === 'B') {
        let w = c | (1 << 26) | ((i.pre ? 1 : 0) << 24) | ((i.up ? 1 : 0) << 23) | ((i.size === 'B' ? 1 : 0) << 22) | (((i.wb && i.pre) ? 1 : 0) << 21) | ((i.load ? 1 : 0) << 20) | (i.rn << 16) | (i.rd << 12);
        if (i.off.kind === 'imm') w |= i.off.value & 0xfff;
        else w |= (1 << 25) | shiftBits(i.off.shift) | i.off.rm;
        return w >>> 0;
      }
      const sh = i.size === 'H' ? 0b1011 : i.size === 'SB' ? 0b1101 : 0b1111;
      let w = c | ((i.pre ? 1 : 0) << 24) | ((i.up ? 1 : 0) << 23) | (((i.wb && i.pre) ? 1 : 0) << 21) | ((i.load ? 1 : 0) << 20) | (i.rn << 16) | (i.rd << 12) | (sh << 4);
      if (i.off.kind === 'imm') w |= (1 << 22) | ((i.off.value & 0xf0) << 4) | (i.off.value & 0xf);
      else w |= i.off.rm;
      return w >>> 0;
    }
    case 'block': {
      const p = i.mode === 'IB' || i.mode === 'DB' ? 1 : 0, u = i.mode === 'IA' || i.mode === 'IB' ? 1 : 0;
      let list = 0; for (const r of i.regs) list |= 1 << r;
      return (c | (1 << 27) | (p << 24) | (u << 23) | ((i.user ? 1 : 0) << 22) | ((i.wb ? 1 : 0) << 21) | ((i.load ? 1 : 0) << 20) | (i.rn << 16) | list) >>> 0;
    }
    case 'b': return (c | (0b101 << 25) | ((i.link ? 1 : 0) << 24) | (((i.target - addr - 8) >> 2) & 0xffffff)) >>> 0;
    case 'bx': return (c | 0x012fff10 | i.rm) >>> 0;
    case 'swp': return (c | (1 << 24) | ((i.byte ? 1 : 0) << 22) | (i.rn << 16) | (i.rd << 12) | 0x90 | i.rm) >>> 0;
    case 'swi': return (c | (0xf << 24) | i.imm) >>> 0;
    case 'mrs': return (c | 0x010f0000 | (i.rd << 12)) >>> 0;
    case 'msr': return (c | 0x0120f000 | (i.flagsOnly ? 0 : 0x10000)) >>> 0;
    case 'nop': return (c | 0x01a00000) >>> 0;
  }
}

const RN = ['R0', 'R1', 'R2', 'R3', 'R4', 'R5', 'R6', 'R7', 'R8', 'R9', 'R10', 'R11', 'R12', 'SP', 'LR', 'PC'];

/** Human-readable disassembly of a parsed instruction. */
export function disasm(i: Instr): string {
  const cc = (i as any).cond === 14 ? '' : CONDS[(i as any).cond];
  const hex = (v: number) => '0x' + (v >>> 0).toString(16).toUpperCase().padStart(v > 0xffff ? 8 : 2, '0');
  const sh = (s: Shift) => s.type === 'RRX' ? ', RRX' : s.reg !== null ? `, ${s.type} ${RN[s.reg]}` : s.amount ? `, ${s.type} #${s.amount}` : '';
  const op2 = (o: Operand2) => o.kind === 'imm' ? `#${hex(o.value)}` : RN[o.rm] + sh(o.shift);
  switch (i.op) {
    case 'dp': {
      const s = i.s && !['CMP', 'CMN', 'TST', 'TEQ'].includes(i.mn) ? 'S' : '';
      if (i.mn === 'MOV' || i.mn === 'MVN') return `${i.mn}${cc}${s} ${RN[i.rd]}, ${op2(i.op2)}`;
      if (['CMP', 'CMN', 'TST', 'TEQ'].includes(i.mn)) return `${i.mn}${cc} ${RN[i.rn]}, ${op2(i.op2)}`;
      return `${i.mn}${cc}${s} ${RN[i.rd]}, ${RN[i.rn]}, ${op2(i.op2)}`;
    }
    case 'mul': return i.mn === 'MUL' ? `MUL${cc}${i.s ? 'S' : ''} ${RN[i.rd]}, ${RN[i.rm]}, ${RN[i.rs]}` : `MLA${cc}${i.s ? 'S' : ''} ${RN[i.rd]}, ${RN[i.rm]}, ${RN[i.rs]}, ${RN[i.rn]}`;
    case 'mull': return `${i.mn}${cc}${i.s ? 'S' : ''} ${RN[i.rdlo]}, ${RN[i.rdhi]}, ${RN[i.rm]}, ${RN[i.rs]}`;
    case 'mem': {
      const mn = (i.load ? 'LDR' : 'STR') + cc + (i.size === 'W' ? '' : i.size);
      const off = i.off.kind === 'imm' ? (i.off.value ? `#${i.up ? '' : '-'}${hex(i.off.value)}` : '') : `${i.up ? '' : '-'}${RN[i.off.rm]}${sh(i.off.shift)}`;
      if (i.literal !== undefined) return `${mn} ${RN[i.rd]}, [PC, #${i.up ? '' : '-'}${hex((i.off as any).value)}]  ; =${hex(i.literal)}`;
      if (!i.pre) return `${mn} ${RN[i.rd]}, [${RN[i.rn]}], ${off || '#0'}`;
      return `${mn} ${RN[i.rd]}, [${RN[i.rn]}${off ? ', ' + off : ''}]${i.wb ? '!' : ''}`;
    }
    case 'block': return `${i.load ? 'LDM' : 'STM'}${cc}${i.mode} ${RN[i.rn]}${i.wb ? '!' : ''}, {${i.regs.map(r => RN[r]).join(', ')}}`;
    case 'b': return `${i.link ? 'BL' : 'B'}${cc} ${hex(i.target)}`;
    case 'bx': return `BX${cc} ${RN[i.rm]}`;
    case 'swp': return `SWP${cc}${i.byte ? 'B' : ''} ${RN[i.rd]}, ${RN[i.rm]}, [${RN[i.rn]}]`;
    case 'swi': return `SWI${cc} ${hex(i.imm)}`;
    case 'mrs': return `MRS${cc} ${RN[i.rd]}, CPSR`;
    case 'msr': return `MSR${cc} CPSR_${i.flagsOnly ? 'f' : 'cf'}, ${op2(i.src)}`;
    case 'nop': return 'NOP';
  }
}
