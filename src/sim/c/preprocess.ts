import { CError, Token, stripComments, tokenizeLine } from './lexer';
import { builtinHeader } from './headers';

interface Macro {
  name: string;
  params: string[] | null; // null => object-like
  variadic: boolean;
  body: Token[];
}

export interface PPResult {
  tokens: Token[];
  warnings: { file: string; line: number; msg: string }[];
}

export function preprocess(files: Record<string, string>, entry: string): PPResult {
  const macros = new Map<string, Macro>();
  const out: Token[] = [];
  const warnings: PPResult['warnings'] = [];
  const includeStack: string[] = [];
  const onceFiles = new Set<string>();

  const define = (name: string, value: string) => {
    macros.set(name, { name, params: null, variadic: false, body: tokenizeLine(value, '<builtin>', 0) });
  };
  define('__LPC17XX__', '1');
  define('__ARMCC_VERSION', '5060750');
  define('NULL', '((void*)0)');
  define('__STDC__', '1');

  const findFile = (name: string): { key: string; text: string } | null => {
    if (files[name] !== undefined) return { key: name, text: files[name] };
    const lower = name.toLowerCase();
    for (const k of Object.keys(files)) if (k.toLowerCase() === lower) return { key: k, text: files[k] };
    const b = builtinHeader(name);
    if (b !== null) return { key: '<' + name.toLowerCase() + '>', text: b };
    return null;
  };

  const processFile = (fileKey: string, text: string) => {
    if (onceFiles.has(fileKey)) return;
    if (includeStack.includes(fileKey)) return;
    if (includeStack.length > 24) throw new CError('#include nested too deeply', fileKey, 1);
    includeStack.push(fileKey);
    const display = fileKey.startsWith('<') ? fileKey : fileKey;
    const raw = stripComments(text.replace(/\r\n?/g, '\n')).split('\n');
    // join continuation lines
    const lines: { text: string; line: number }[] = [];
    for (let i = 0; i < raw.length; i++) {
      let t = raw[i];
      const start = i;
      while (t.endsWith('\\') && i + 1 < raw.length) { t = t.slice(0, -1) + ' ' + raw[++i]; }
      lines.push({ text: t, line: start + 1 });
    }
    // conditional stack
    const cond: { active: boolean; taken: boolean; parentActive: boolean; seenElse: boolean; line: number }[] = [];
    const isActive = () => cond.length === 0 || cond[cond.length - 1].active;

    let pending: Token[] = [];
    const flush = () => {
      if (pending.length) { expandInto(pending, out); pending = []; }
    };

    for (const { text: lt, line } of lines) {
      const trimmed = lt.trimStart();
      if (trimmed.startsWith('#')) {
        const dir = trimmed.slice(1).trimStart();
        const m = /^([A-Za-z_]+)\s*(.*)$/.exec(dir);
        const name = m ? m[1] : '';
        const rest = m ? m[2] : '';
        if (name === 'ifdef' || name === 'ifndef') {
          const id = rest.trim().split(/\s+/)[0];
          const parentActive = isActive();
          let v = macros.has(id);
          if (name === 'ifndef') v = !v;
          cond.push({ active: parentActive && v, taken: v, parentActive, seenElse: false, line });
          continue;
        }
        if (name === 'if') {
          const parentActive = isActive();
          const v = parentActive ? evalCond(rest, display, line) !== 0 : false;
          cond.push({ active: parentActive && v, taken: v, parentActive, seenElse: false, line });
          continue;
        }
        if (name === 'elif') {
          const top = cond[cond.length - 1];
          if (!top) throw new CError('#elif without #if', display, line);
          if (top.taken || !top.parentActive) { top.active = false; }
          else {
            const v = evalCond(rest, display, line) !== 0;
            top.active = v; top.taken = v;
          }
          continue;
        }
        if (name === 'else') {
          const top = cond[cond.length - 1];
          if (!top) throw new CError('#else without #if', display, line);
          top.active = top.parentActive && !top.taken;
          top.taken = true;
          top.seenElse = true;
          continue;
        }
        if (name === 'endif') {
          if (!cond.length) throw new CError('#endif without #if', display, line);
          cond.pop();
          continue;
        }
        if (!isActive()) continue;
        if (name === 'define') {
          const mm = /^([A-Za-z_][A-Za-z0-9_]*)(\(([^)]*)\))?\s*(.*)$/.exec(rest);
          if (!mm) throw new CError('Malformed #define', display, line);
          const mname = mm[1];
          let params: string[] | null = null;
          let variadic = false;
          if (mm[2] !== undefined) {
            params = mm[3].split(',').map(s => s.trim()).filter(s => s.length);
            if (params.length && params[params.length - 1] === '...') { variadic = true; params[params.length - 1] = '__VA_ARGS__'; }
          }
          const body = tokenizeLine(mm[4], display, line);
          macros.set(mname, { name: mname, params, variadic, body });
          continue;
        }
        if (name === 'undef') { macros.delete(rest.trim()); continue; }
        if (name === 'include') {
          flush();
          const im = /^[<"]([^>"]+)[>"]/.exec(rest.trim());
          if (!im) throw new CError('Malformed #include', display, line);
          const f = findFile(im[1]);
          if (!f) {
            throw new CError(`Cannot open include file '${im[1]}'. Add it to the project with the + tab, or check the spelling.`, display, line);
          }
          processFile(f.key, f.text);
          continue;
        }
        if (name === 'pragma') { if (rest.trim() === 'once') onceFiles.add(fileKey); continue; }
        if (name === 'error') throw new CError('#error ' + rest, display, line);
        if (name === 'warning') { warnings.push({ file: display, line, msg: rest }); continue; }
        if (name === 'line' || name === '') continue;
        throw new CError(`Unknown preprocessor directive '#${name}'`, display, line);
      }
      if (!isActive()) continue;
      const toks = tokenizeLine(lt, display, line);
      // function-like macro invocations can span lines, so accumulate
      for (const t of toks) pending.push(t);
      if (!needsMore(pending)) flush();
    }
    flush();
    if (cond.length) throw new CError('Unterminated #if / #ifdef', display, cond[cond.length - 1].line);
    includeStack.pop();
  };

  // Returns true if the pending token list ends inside an unfinished macro call.
  function needsMore(toks: Token[]): boolean {
    let depth = 0;
    let inCall = false;
    for (let i = 0; i < toks.length; i++) {
      const t = toks[i];
      if (!inCall && t.k === 'id') {
        const m = macros.get(t.v);
        if (m && m.params) {
          if (i + 1 >= toks.length) return true;
          if (toks[i + 1].v === '(') { inCall = true; depth = 0; }
        }
        continue;
      }
      if (inCall) {
        if (t.v === '(') depth++;
        else if (t.v === ')') { depth--; if (depth === 0) inCall = false; }
      }
    }
    return inCall;
  }

  function expandInto(input: Token[], dest: Token[]) {
    const res = expandList(input);
    for (const t of res) dest.push(t);
  }

  function expandList(input: Token[]): Token[] {
    const work = input.slice();
    const result: Token[] = [];
    let guard = 0;
    while (work.length) {
      if (++guard > 2_000_000) throw new CError('Macro expansion too large (recursive macro?)', input[0]?.file ?? '', input[0]?.line ?? 0);
      const t = work.shift()!;
      if (t.k !== 'id') { result.push(t); continue; }
      const m = macros.get(t.v);
      if (!m || (t.hide && t.hide.has(t.v))) { result.push(t); continue; }
      if (t.v === 'defined') { result.push(t); continue; }
      const hide = new Set(t.hide ?? []);
      hide.add(m.name);
      if (m.params === null) {
        const body = m.body.map(b => ({ ...b, file: t.file, line: t.line, col: t.col, hide }));
        work.unshift(...paste(body));
        continue;
      }
      // function-like: needs '('
      if (!work.length || work[0].v !== '(') { result.push(t); continue; }
      work.shift();
      const args: Token[][] = [[]];
      let depth = 0;
      for (;;) {
        const a = work.shift();
        if (!a) throw new CError(`Unterminated call to macro '${m.name}'`, t.file, t.line, t.col);
        if (a.v === '(' && a.k === 'punct') depth++;
        if (a.v === ')' && a.k === 'punct') { if (depth === 0) break; depth--; }
        if (a.v === ',' && a.k === 'punct' && depth === 0 && !(m.variadic && args.length > m.params.length - 1)) { args.push([]); continue; }
        args[args.length - 1].push(a);
      }
      if (m.params.length === 0 && args.length === 1 && args[0].length === 0) args.length = 0;
      if (args.length !== m.params.length && !(m.variadic && args.length >= m.params.length - 1)) {
        throw new CError(`Macro '${m.name}' expects ${m.params.length} argument(s), got ${args.length}`, t.file, t.line, t.col);
      }
      const expandedArgs = args.map(a => expandList(a));
      const body: Token[] = [];
      for (let i = 0; i < m.body.length; i++) {
        const b = m.body[i];
        if (b.v === '#' && b.k === 'punct' && m.body[i + 1]?.k === 'id') {
          const pi = m.params.indexOf(m.body[i + 1].v);
          if (pi >= 0) {
            body.push({ k: 'str', v: (args[pi] ?? []).map(x => x.k === 'str' ? JSON.stringify(x.v) : x.v).join(' '), file: t.file, line: t.line, col: t.col });
            i++;
            continue;
          }
        }
        if (b.k === 'id') {
          const pi = m.params.indexOf(b.v);
          if (pi >= 0) {
            const nextIsPaste = m.body[i + 1]?.v === '##';
            const prevIsPaste = m.body[i - 1]?.v === '##';
            const src = (nextIsPaste || prevIsPaste) ? (args[pi] ?? []) : (expandedArgs[pi] ?? []);
            for (const x of src) body.push({ ...x, line: t.line, file: t.file });
            continue;
          }
        }
        body.push({ ...b, file: t.file, line: t.line, col: t.col });
      }
      work.unshift(...paste(body).map(x => ({ ...x, hide: new Set([...(x.hide ?? []), ...hide]) })));
    }
    return result;
  }

  function paste(toks: Token[]): Token[] {
    if (!toks.some(t => t.v === '##')) return toks;
    const res: Token[] = [];
    for (let i = 0; i < toks.length; i++) {
      if (toks[i].v === '##' && res.length && i + 1 < toks.length) {
        const a = res.pop()!;
        const b = toks[++i];
        const joined = tokenizeLine(a.v + b.v, a.file, a.line);
        res.push(...joined);
      } else res.push(toks[i]);
    }
    return res;
  }

  function evalCond(expr: string, file: string, line: number): number {
    let toks = tokenizeLine(expr, file, line);
    // replace defined X / defined(X)
    const pre: Token[] = [];
    for (let i = 0; i < toks.length; i++) {
      if (toks[i].v === 'defined') {
        let name: string;
        if (toks[i + 1]?.v === '(') { name = toks[i + 2]?.v; i += 3; }
        else { name = toks[i + 1]?.v; i += 1; }
        pre.push({ k: 'num', v: macros.has(name) ? '1' : '0', n: macros.has(name) ? 1 : 0, file, line, col: 0 });
      } else pre.push(toks[i]);
    }
    toks = expandList(pre);
    let p = 0;
    const peek = () => toks[p];
    const next = () => toks[p++];
    const prim = (): number => {
      const t = next();
      if (!t) throw new CError('Bad #if expression', file, line);
      if (t.v === '(') { const v = ternary(); next(); return v; }
      if (t.v === '!') return prim() ? 0 : 1;
      if (t.v === '-') return -prim();
      if (t.v === '+') return prim();
      if (t.v === '~') return ~prim();
      if (t.k === 'num' || t.k === 'char') return t.n!;
      if (t.k === 'id') return 0;
      throw new CError(`Unexpected '${t.v}' in #if`, file, line);
    };
    const bin = (ops: string[][], level: number): number => {
      if (level >= ops.length) return prim();
      let v = bin(ops, level + 1);
      while (peek() && ops[level].includes(peek().v)) {
        const op = next().v;
        const r = bin(ops, level + 1);
        switch (op) {
          case '||': v = (v || r) ? 1 : 0; break;
          case '&&': v = (v && r) ? 1 : 0; break;
          case '|': v = v | r; break;
          case '^': v = v ^ r; break;
          case '&': v = v & r; break;
          case '==': v = v === r ? 1 : 0; break;
          case '!=': v = v !== r ? 1 : 0; break;
          case '<': v = v < r ? 1 : 0; break;
          case '>': v = v > r ? 1 : 0; break;
          case '<=': v = v <= r ? 1 : 0; break;
          case '>=': v = v >= r ? 1 : 0; break;
          case '<<': v = v << r; break;
          case '>>': v = v >> r; break;
          case '+': v = v + r; break;
          case '-': v = v - r; break;
          case '*': v = v * r; break;
          case '/': v = r ? Math.trunc(v / r) : 0; break;
          case '%': v = r ? v % r : 0; break;
        }
      }
      return v;
    };
    const LEVELS = [['||'], ['&&'], ['|'], ['^'], ['&'], ['==', '!='], ['<', '>', '<=', '>='], ['<<', '>>'], ['+', '-'], ['*', '/', '%']];
    const ternary = (): number => {
      const c = bin(LEVELS, 0);
      if (peek()?.v === '?') { next(); const a = ternary(); next(); const b = ternary(); return c ? a : b; }
      return c;
    };
    return ternary();
  }

  const entryFile = findFile(entry);
  if (!entryFile) throw new CError(`File '${entry}' not found`, entry, 1);
  processFile(entryFile.key, entryFile.text);
  out.push({ k: 'eof', v: '<eof>', file: entry, line: (entryFile.text.match(/\n/g)?.length ?? 0) + 1, col: 0 });
  return { tokens: out, warnings };
}
