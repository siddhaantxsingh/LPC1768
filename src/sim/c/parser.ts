import { CError, Token } from './lexer';
import { CType, Field, T, alignOf, ptr, sizeOf } from './types';

export type Expr =
  | { t: 'num'; v: number; type: CType; line: number; file: string }
  | { t: 'str'; v: string; line: number; file: string }
  | { t: 'id'; name: string; line: number; file: string }
  | { t: 'bin'; op: string; a: Expr; b: Expr; line: number; file: string }
  | { t: 'assign'; op: string; a: Expr; b: Expr; line: number; file: string }
  | { t: 'un'; op: string; a: Expr; line: number; file: string }
  | { t: 'pre'; op: string; a: Expr; line: number; file: string }
  | { t: 'post'; op: string; a: Expr; line: number; file: string }
  | { t: 'cond'; c: Expr; a: Expr; b: Expr; line: number; file: string }
  | { t: 'call'; f: Expr; args: Expr[]; line: number; file: string }
  | { t: 'idx'; a: Expr; i: Expr; line: number; file: string }
  | { t: 'mem'; a: Expr; name: string; arrow: boolean; line: number; file: string }
  | { t: 'cast'; type: CType; a: Expr; line: number; file: string }
  | { t: 'sizeof_t'; type: CType; line: number; file: string }
  | { t: 'sizeof_e'; a: Expr; line: number; file: string }
  | { t: 'comma'; a: Expr; b: Expr; line: number; file: string }
  | { t: 'init'; items: Expr[]; line: number; file: string };

export interface Decl {
  name: string;
  type: CType;
  init: Expr | null;
  storage: string | null;
  line: number;
  file: string;
}

export type Stmt =
  | { t: 'block'; body: Stmt[]; line: number; file: string }
  | { t: 'expr'; e: Expr; line: number; file: string }
  | { t: 'decl'; decls: Decl[]; line: number; file: string }
  | { t: 'if'; c: Expr; a: Stmt; b: Stmt | null; line: number; file: string }
  | { t: 'while'; c: Expr; body: Stmt; line: number; file: string }
  | { t: 'do'; body: Stmt; c: Expr; line: number; file: string }
  | { t: 'for'; init: Stmt | null; c: Expr | null; step: Expr | null; body: Stmt; line: number; file: string }
  | { t: 'return'; e: Expr | null; line: number; file: string }
  | { t: 'break'; line: number; file: string }
  | { t: 'continue'; line: number; file: string }
  | { t: 'switch'; e: Expr; body: Stmt; line: number; file: string }
  | { t: 'case'; v: Expr; line: number; file: string }
  | { t: 'default'; line: number; file: string }
  | { t: 'label'; name: string; line: number; file: string }
  | { t: 'goto'; name: string; line: number; file: string }
  | { t: 'empty'; line: number; file: string };

export interface FuncDef {
  name: string;
  type: Extract<CType, { k: 'func' }>;
  params: { name: string; type: CType }[];
  body: Stmt;
  line: number;
  file: string;
  endLine: number;
}

export interface Program {
  funcs: FuncDef[];
  globals: Decl[];
  protos: Map<string, Extract<CType, { k: 'func' }>>;
  enumConsts: Map<string, number>;
}

const TYPE_KW = new Set(['void', 'char', 'short', 'int', 'long', 'float', 'double', 'signed', 'unsigned', '_Bool', 'struct', 'union', 'enum']);
const QUAL_KW = new Set(['const', 'volatile', 'register', 'static', 'extern', 'inline', '__inline', 'auto', 'typedef', '__irq', '__asm', 'restrict', '__restrict', '__packed', '__weak']);

interface Spec { type: CType; storage: string | null }

export function parse(tokens: Token[]): Program {
  let p = 0;
  const typedefs: Map<string, CType>[] = [new Map()];
  const structTags = new Map<string, Extract<CType, { k: 'struct' }>>();
  const enumConsts = new Map<string, number>();
  const prog: Program = { funcs: [], globals: [], protos: new Map(), enumConsts };
  let anonCount = 0;

  const peek = (o = 0) => tokens[Math.min(p + o, tokens.length - 1)];
  const next = () => tokens[p++];
  const err = (msg: string, t: Token = peek()): never => { throw new CError(msg, t.file, t.line, t.col); };
  const is = (v: string, o = 0) => { const t = peek(o); return (t.k === 'punct' || t.k === 'id') && t.v === v; };
  const accept = (v: string) => { if (is(v)) { p++; return true; } return false; };
  const expect = (v: string, what?: string) => {
    if (!is(v)) {
      const t = peek();
      const got = t.k === 'eof' ? 'end of file' : `'${t.v}'`;
      if (v === ';') {
        // report on the previous token's line: that is where the semicolon is missing
        const prev = tokens[p - 1] ?? t;
        throw new CError(`Expected ';' ${what ? 'after ' + what : ''} (missing semicolon?)`.replace('  ', ' '), prev.file, prev.line, prev.col);
      }
      err(`Expected '${v}'${what ? ' ' + what : ''} but found ${got}`);
    }
    return next();
  };
  const lookupTypedef = (name: string): CType | undefined => {
    for (let i = typedefs.length - 1; i >= 0; i--) { const t = typedefs[i].get(name); if (t) return t; }
    return undefined;
  };

  const isTypeStart = (o = 0): boolean => {
    const t = peek(o);
    if (t.k !== 'id') return false;
    return TYPE_KW.has(t.v) || QUAL_KW.has(t.v) || lookupTypedef(t.v) !== undefined;
  };

  function parseSpec(): Spec {
    let storage: string | null = null;
    let signed: boolean | null = null;
    let base: string | null = null;
    let longs = 0;
    let short = false;
    let custom: CType | null = null;
    const start = peek();
    for (;;) {
      const t = peek();
      if (t.k !== 'id') break;
      if (QUAL_KW.has(t.v)) {
        if (['static', 'extern', 'typedef', 'register', 'auto'].includes(t.v)) storage = t.v === 'register' || t.v === 'auto' ? storage : t.v;
        p++;
        continue;
      }
      if (t.v === 'signed') { signed = true; p++; continue; }
      if (t.v === 'unsigned') { signed = false; p++; continue; }
      if (t.v === 'long') { longs++; p++; continue; }
      if (t.v === 'short') { short = true; p++; continue; }
      if (t.v === 'void' || t.v === 'char' || t.v === 'int' || t.v === 'float' || t.v === 'double' || t.v === '_Bool') {
        if (base && !(base === 'int' || t.v === 'int')) err(`Two data types in declaration ('${base}' and '${t.v}')`);
        if (!base || base === 'int') base = t.v; p++; continue;
      }
      if (t.v === 'struct' || t.v === 'union') { custom = parseStruct(); continue; }
      if (t.v === 'enum') { custom = parseEnum(); continue; }
      if (!base && !custom && signed === null && !longs && !short) {
        const td = lookupTypedef(t.v);
        if (td) { custom = td; p++; continue; }
      }
      break;
    }
    let type: CType;
    if (custom) type = custom;
    else if (base === 'void') type = T.void;
    else if (base === 'float') type = T.float;
    else if (base === 'double') type = T.double;
    else if (base === '_Bool') type = T.bool;
    else if (base === 'char') type = signed === false ? T.uchar : T.char;
    else if (short) type = signed === false ? T.ushort : T.short;
    else if (longs >= 2) type = signed === false ? T.ullong : T.llong;
    else if (base === 'int' || longs || signed !== null) type = signed === false ? T.uint : T.int;
    else err(`Expected a type`, start);
    return { type: type!, storage };
  }

  function parseStruct(): CType {
    const kw = next().v;
    const union = kw === 'union';
    let name = '';
    if (peek().k === 'id' && !is('{')) name = next().v;
    let st: Extract<CType, { k: 'struct' }>;
    if (name && structTags.has(kw + ' ' + name)) st = structTags.get(kw + ' ' + name)!;
    else {
      st = { k: 'struct', name: name || `<anonymous ${++anonCount}>`, union, fields: null, size: 0, align: 1 };
      if (name) structTags.set(kw + ' ' + name, st);
    }
    if (accept('{')) {
      const fields: Field[] = [];
      let offset = 0;
      let align = 1;
      const place = (fname: string, ftype: CType) => {
        const a = alignOf(ftype);
        align = Math.max(align, a);
        if (union) { fields.push({ name: fname, type: ftype, offset: 0 }); offset = Math.max(offset, sizeOf(ftype)); }
        else {
          offset = Math.ceil(offset / a) * a;
          fields.push({ name: fname, type: ftype, offset });
          offset += sizeOf(ftype);
        }
      };
      while (!accept('}')) {
        const spec = parseSpec();
        if (accept(';')) {
          // anonymous struct/union member: flatten
          if (spec.type.k === 'struct' && spec.type.fields) {
            const inner = spec.type;
            const a = inner.align;
            align = Math.max(align, a);
            const base = union ? 0 : Math.ceil(offset / a) * a;
            for (const f of inner.fields!) fields.push({ name: f.name, type: f.type, offset: base + f.offset });
            if (union) offset = Math.max(offset, inner.size);
            else offset = base + inner.size;
          }
          continue;
        }
        do {
          const d = parseDeclarator(spec.type);
          if (accept(':')) { parseAssign(); } // bitfields: width ignored, treated as full member
          if (!d.name) err('Expected a member name');
          place(d.name, d.type);
        } while (accept(','));
        expect(';', 'struct member');
      }
      st.fields = fields;
      st.align = align;
      st.size = Math.ceil(offset / align) * align;
    }
    return st;
  }

  function parseEnum(): CType {
    next();
    let name = '';
    if (peek().k === 'id' && !is('{')) name = next().v;
    if (accept('{')) {
      let v = 0;
      while (!accept('}')) {
        const id = next();
        if (id.k !== 'id') err('Expected enumerator name', id);
        if (accept('=')) v = constEval(parseAssign());
        enumConsts.set(id.v, v);
        v++;
        if (!accept(',')) { expect('}', 'to close enum'); break; }
      }
    }
    return { k: 'enum', name: name || 'anonymous' };
  }

  // Declarator: pointers, name, arrays, function params.
  function parseDeclarator(base: CType, abstract = false): { name: string; type: CType; params?: { name: string; type: CType }[]; tok: Token } {
    let ptrs = 0;
    for (;;) {
      if (accept('*')) { ptrs++; while (peek().k === 'id' && (peek().v === 'const' || peek().v === 'volatile' || peek().v === 'restrict')) p++; continue; }
      break;
    }
    let type = base;
    for (let i = 0; i < ptrs; i++) type = ptr(type);
    let name = '';
    const tok = peek();
    let inner: ((t: CType) => CType) | null = null;
    let innerName = '';
    if (is('(') && (is('*', 1) || (peek(1).k === 'id' && !isTypeStart(1) && is(')', 2) && false))) {
      // function pointer / parenthesised declarator: (*name)(...)
      next();
      let ip = 0;
      while (accept('*')) ip++;
      if (peek().k === 'id') innerName = next().v;
      expect(')');
      inner = (t: CType) => { let r = t; for (let i = 0; i < ip; i++) r = ptr(r); return r; };
    } else if (peek().k === 'id' && !abstract) {
      name = next().v;
    } else if (peek().k === 'id' && abstract && !isTypeStart()) {
      name = next().v;
    }
    let params: { name: string; type: CType }[] | undefined;
    // suffixes
    const suffixes: ((t: CType) => CType)[] = [];
    for (;;) {
      if (accept('[')) {
        let len: number | null = null;
        if (!is(']')) len = constEval(parseExpr());
        expect(']');
        suffixes.push((t) => ({ k: 'arr', of: t, len }));
        continue;
      }
      if (is('(')) {
        next();
        const ps: { name: string; type: CType }[] = [];
        let variadic = false;
        let oldStyle = false;
        if (is(')')) { oldStyle = true; }
        else if (is('void') && is(')', 1)) { next(); }
        else {
          for (;;) {
            if (accept('...')) { variadic = true; break; }
            const s = parseSpec();
            const d = parseDeclarator(s.type, true);
            let pt = d.type;
            if (pt.k === 'arr') pt = ptr(pt.of);
            if (pt.k === 'func') pt = ptr(pt);
            ps.push({ name: d.name, type: pt });
            if (!accept(',')) break;
          }
        }
        expect(')', 'to close parameter list');
        if (!params) params = ps;
        suffixes.push((t) => ({ k: 'func', ret: t, params: ps.map(x => x.type), variadic, oldStyle }));
        continue;
      }
      break;
    }
    // apply suffixes right-to-left so int a[2][3] is array 2 of array 3
    for (let i = suffixes.length - 1; i >= 0; i--) type = suffixes[i](type);
    if (inner) { type = inner(type); name = innerName; params = undefined; }
    return { name, type, params, tok };
  }

  function parseTypeName(): CType {
    const s = parseSpec();
    return parseDeclarator(s.type, true).type;
  }

  function constEval(e: Expr): number {
    switch (e.t) {
      case 'num': return e.v;
      case 'id': if (enumConsts.has(e.name)) return enumConsts.get(e.name)!; break;
      case 'un': {
        const v = constEval(e.a);
        if (e.op === '-') return -v; if (e.op === '+') return v; if (e.op === '~') return ~v; if (e.op === '!') return v ? 0 : 1;
        break;
      }
      case 'cast': return constEval(e.a);
      case 'sizeof_t': return sizeOf(e.type);
      case 'bin': {
        const a = constEval(e.a), b = constEval(e.b);
        switch (e.op) {
          case '+': return a + b; case '-': return a - b; case '*': return a * b;
          case '/': return Math.trunc(a / b); case '%': return a % b;
          case '<<': return a << b; case '>>': return a >> b;
          case '&': return a & b; case '|': return a | b; case '^': return a ^ b;
          case '<': return +(a < b); case '>': return +(a > b); case '==': return +(a === b); case '!=': return +(a !== b);
          case '&&': return +(a && b); case '||': return +(a || b);
        }
        break;
      }
      case 'cond': return constEval(e.c) ? constEval(e.a) : constEval(e.b);
    }
    throw new CError('Expected a constant expression', e.file, e.line);
  }

  // ---------- expressions ----------
  const mk = <E extends Expr>(e: Omit<E, 'line' | 'file'>, t: Token): E => ({ ...(e as any), line: t.line, file: t.file });

  function parseExpr(): Expr {
    let e = parseAssign();
    while (is(',')) { const t = next(); e = mk({ t: 'comma', a: e, b: parseAssign() } as any, t); }
    return e;
  }

  const ASSIGN_OPS = new Set(['=', '+=', '-=', '*=', '/=', '%=', '&=', '|=', '^=', '<<=', '>>=']);
  function parseAssign(): Expr {
    const lhs = parseCond();
    const t = peek();
    if (t.k === 'punct' && ASSIGN_OPS.has(t.v)) {
      next();
      const rhs = parseAssign();
      return mk({ t: 'assign', op: t.v, a: lhs, b: rhs } as any, t);
    }
    return lhs;
  }

  function parseCond(): Expr {
    const c = parseBin(0);
    if (is('?')) {
      const t = next();
      const a = parseExpr();
      expect(':', 'in conditional expression');
      const b = parseCond();
      return mk({ t: 'cond', c, a, b } as any, t);
    }
    return c;
  }

  const BIN_LEVELS = [['||'], ['&&'], ['|'], ['^'], ['&'], ['==', '!='], ['<', '>', '<=', '>='], ['<<', '>>'], ['+', '-'], ['*', '/', '%']];
  function parseBin(level: number): Expr {
    if (level >= BIN_LEVELS.length) return parseUnary();
    let e = parseBin(level + 1);
    for (;;) {
      const t = peek();
      if (t.k === 'punct' && BIN_LEVELS[level].includes(t.v)) {
        next();
        e = mk({ t: 'bin', op: t.v, a: e, b: parseBin(level + 1) } as any, t);
      } else break;
    }
    return e;
  }

  function parseUnary(): Expr {
    const t = peek();
    if (t.k === 'punct') {
      if (t.v === '++' || t.v === '--') { next(); return mk({ t: 'pre', op: t.v, a: parseUnary() } as any, t); }
      if (['-', '+', '!', '~', '*', '&'].includes(t.v)) { next(); return mk({ t: 'un', op: t.v, a: parseCast() } as any, t); }
      if (t.v === '(' && isTypeStart(1)) return parseCast();
    }
    if (t.k === 'id' && t.v === 'sizeof') {
      next();
      if (is('(') && isTypeStart(1)) {
        next();
        const ty = parseTypeName();
        expect(')');
        return mk({ t: 'sizeof_t', type: ty } as any, t);
      }
      return mk({ t: 'sizeof_e', a: parseUnary() } as any, t);
    }
    return parsePostfix(parsePrimary());
  }

  function parseCast(): Expr {
    if (is('(') && isTypeStart(1)) {
      const t = next();
      const ty = parseTypeName();
      expect(')', 'to close cast');
      if (is('{')) err('Compound literals are not supported');
      return mk({ t: 'cast', type: ty, a: parseCast() } as any, t);
    }
    return parseUnary();
  }

  function parsePrimary(): Expr {
    const t = next();
    switch (t.k) {
      case 'num': {
        const v = t.n!;
        let type: CType;
        if (t.long! >= 2) type = t.unsigned ? T.ullong : T.llong;
        else if (t.unsigned) type = T.uint;
        else if (v > 0x7fffffff) type = (/^0[xXbB0-7]/.test(t.v) && v <= 0xffffffff) || v <= 0xffffffff ? T.uint : T.llong;
        else type = T.int;
        return mk({ t: 'num', v, type } as any, t);
      }
      case 'float': return mk({ t: 'num', v: t.n!, type: t.isF32 ? T.float : T.double } as any, t);
      case 'char': return mk({ t: 'num', v: t.n!, type: T.int } as any, t);
      case 'str': {
        let s = t.v;
        while (peek().k === 'str') s += next().v;
        return mk({ t: 'str', v: s } as any, t);
      }
      case 'id': {
        if (TYPE_KW.has(t.v) || lookupTypedef(t.v)) err(`Unexpected type name '${t.v}' here`, t);
        return mk({ t: 'id', name: t.v } as any, t);
      }
      case 'punct':
        if (t.v === '(') { const e = parseExpr(); expect(')', 'to close parenthesis'); return e; }
        break;
    }
    if (t.k === 'eof') err('Unexpected end of file (missing closing brace?)', t);
    return err(`Unexpected '${t.v}' in expression`, t);
  }

  function parsePostfix(e: Expr): Expr {
    for (;;) {
      const t = peek();
      if (t.k !== 'punct') break;
      if (t.v === '[') { next(); const i = parseExpr(); expect(']'); e = mk({ t: 'idx', a: e, i } as any, t); continue; }
      if (t.v === '(') {
        next();
        const args: Expr[] = [];
        if (!is(')')) { do args.push(parseAssign()); while (accept(',')); }
        expect(')', 'to close function call');
        e = mk({ t: 'call', f: e, args } as any, t);
        continue;
      }
      if (t.v === '.' || t.v === '->') {
        next();
        const n = next();
        if (n.k !== 'id') err(`Expected member name after '${t.v}'`, n);
        e = mk({ t: 'mem', a: e, name: n.v, arrow: t.v === '->' } as any, t);
        continue;
      }
      if (t.v === '++' || t.v === '--') { next(); e = mk({ t: 'post', op: t.v, a: e } as any, t); continue; }
      break;
    }
    return e;
  }

  // ---------- initializers ----------
  function parseInitializer(): Expr {
    if (is('{')) {
      const t = next();
      const items: Expr[] = [];
      while (!is('}')) {
        if (is('.') || is('[')) err('Designated initializers are not supported');
        items.push(parseInitializer());
        if (!accept(',')) break;
      }
      expect('}', 'to close initializer list');
      return mk({ t: 'init', items } as any, t);
    }
    return parseAssign();
  }

  // ---------- statements ----------
  function parseDeclStmt(): Stmt {
    const t = peek();
    const spec = parseSpec();
    const decls: Decl[] = [];
    if (accept(';')) return { t: 'decl', decls, line: t.line, file: t.file };
    do {
      const d = parseDeclarator(spec.type);
      if (!d.name) err('Expected a variable name', d.tok);
      if (spec.storage === 'typedef') {
        typedefs[typedefs.length - 1].set(d.name, d.type);
        continue;
      }
      let init: Expr | null = null;
      if (accept('=')) init = parseInitializer();
      let type = d.type;
      if (type.k === 'arr' && type.len === null && init) {
        if (init.t === 'init' && init.items.length === 1 && init.items[0].t === 'str' && type.of.k === 'int' && type.of.size === 1) type = { ...type, len: init.items[0].v.length + 1 };
        else if (init.t === 'init') type = { ...type, len: init.items.length };
        else if (init.t === 'str') type = { ...type, len: init.v.length + 1 };
      }
      decls.push({ name: d.name, type, init, storage: spec.storage, line: d.tok.line, file: d.tok.file });
    } while (accept(','));
    expect(';', 'declaration');
    return { t: 'decl', decls, line: t.line, file: t.file };
  }

  function parseStmt(): Stmt {
    const t = peek();
    const base = { line: t.line, file: t.file };
    if (t.k === 'punct') {
      if (t.v === '{') return parseBlock();
      if (t.v === ';') { next(); return { t: 'empty', ...base }; }
    }
    if (t.k === 'id') {
      switch (t.v) {
        case 'if': {
          next(); expect('(', "after 'if'"); const c = parseExpr(); expect(')', 'to close if condition');
          const a = parseStmt();
          let b: Stmt | null = null;
          if (accept('else')) b = parseStmt();
          return { t: 'if', c, a, b, ...base };
        }
        case 'while': {
          next(); expect('(', "after 'while'"); const c = parseExpr(); expect(')', 'to close while condition');
          return { t: 'while', c, body: parseStmt(), ...base };
        }
        case 'do': {
          next(); const body = parseStmt(); expect('while', "after do-body"); expect('('); const c = parseExpr(); expect(')'); expect(';', 'do-while');
          return { t: 'do', body, c, ...base };
        }
        case 'for': {
          next(); expect('(', "after 'for'");
          typedefs.push(new Map());
          let init: Stmt | null = null;
          if (!accept(';')) {
            if (isTypeStart()) init = parseDeclStmt();
            else { const e = parseExpr(); expect(';', 'for-init'); init = { t: 'expr', e, ...base }; }
          }
          const c = is(';') ? null : parseExpr();
          expect(';', 'for-condition');
          const step = is(')') ? null : parseExpr();
          expect(')', 'to close for');
          const body = parseStmt();
          typedefs.pop();
          return { t: 'for', init, c, step, body, ...base };
        }
        case 'return': {
          next();
          const e = is(';') ? null : parseExpr();
          expect(';', 'return statement');
          return { t: 'return', e, ...base };
        }
        case 'break': next(); expect(';', 'break'); return { t: 'break', ...base };
        case 'continue': next(); expect(';', 'continue'); return { t: 'continue', ...base };
        case 'switch': {
          next(); expect('('); const e = parseExpr(); expect(')');
          return { t: 'switch', e, body: parseStmt(), ...base };
        }
        case 'case': { next(); const v = parseCond(); expect(':', 'after case value'); return { t: 'case', v, ...base }; }
        case 'default': { next(); expect(':', "after 'default'"); return { t: 'default', ...base }; }
        case 'goto': { next(); const n = next(); expect(';'); return { t: 'goto', name: n.v, ...base }; }
        case 'else': err("'else' without a matching 'if' (check braces and semicolons)");
      }
      if (peek(1).v === ':' && peek(1).k === 'punct' && !isTypeStart()) {
        next(); next();
        return { t: 'label', name: t.v, ...base };
      }
      if (t.v === '__asm' || t.v === '__ASM' || t.v === 'asm') {
        // skip inline assembly like __asm("nop") or __ASM volatile ("...")
        next();
        while (peek().k === 'id') next();
        if (accept('(')) { let d = 1; while (d > 0 && peek().k !== 'eof') { const x = next(); if (x.v === '(') d++; else if (x.v === ')') d--; } }
        else if (accept('{')) { let d = 1; while (d > 0 && peek().k !== 'eof') { const x = next(); if (x.v === '{') d++; else if (x.v === '}') d--; } }
        accept(';');
        return { t: 'empty', ...base };
      }
      if (isTypeStart()) return parseDeclStmt();
    }
    const e = parseExpr();
    expect(';', 'statement');
    return { t: 'expr', e, ...base };
  }

  function parseBlock(): Stmt {
    const t = expect('{');
    typedefs.push(new Map());
    const body: Stmt[] = [];
    while (!is('}')) {
      if (peek().k === 'eof') err("Missing '}' — the block opened here is never closed", t);
      body.push(parseStmt());
    }
    next();
    typedefs.pop();
    return { t: 'block', body, line: t.line, file: t.file };
  }

  // ---------- top level ----------
  while (peek().k !== 'eof') {
    if (accept(';')) continue;
    const start = peek();
    if (!isTypeStart()) {
      // K&R style "main() { ... }" without a return type
      if (start.k === 'id' && is('(', 1)) {
        // treat as int
      } else err(`Unexpected '${start.v}' at file scope`);
    }
    const spec = isTypeStart() ? parseSpec() : { type: T.int, storage: null };
    if (accept(';')) continue; // struct/enum definition only
    let first = true;
    for (;;) {
      const d = parseDeclarator(spec.type);
      if (!d.name) err('Expected a name in declaration', d.tok);
      if (spec.storage === 'typedef') {
        typedefs[0].set(d.name, d.type);
      } else if (d.type.k === 'func' && first && is('{')) {
        const params = (d.params ?? []).map((pp, i) => ({ name: pp.name || `__p${i}`, type: pp.type }));
        const body = parseBlock();
        const end = tokens[p - 1];
        prog.funcs.push({ name: d.name, type: d.type as any, params, body, line: d.tok.line, file: d.tok.file, endLine: end.line });
        break;
      } else if (d.type.k === 'func') {
        prog.protos.set(d.name, d.type as any);
      } else {
        let init: Expr | null = null;
        if (accept('=')) init = parseInitializer();
        let type = d.type;
        if (type.k === 'arr' && type.len === null && init) {
          if (init.t === 'init' && init.items.length === 1 && init.items[0].t === 'str' && type.of.k === 'int' && type.of.size === 1) type = { ...type, len: init.items[0].v.length + 1 };
          else if (init.t === 'init') type = { ...type, len: init.items.length };
          else if (init.t === 'str') type = { ...type, len: init.v.length + 1 };
        }
        prog.globals.push({ name: d.name, type, init, storage: spec.storage, line: d.tok.line, file: d.tok.file });
      }
      first = false;
      if (accept(',')) continue;
      expect(';', 'declaration');
      break;
    }
  }
  return prog;
}
