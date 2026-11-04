// Tokenizer for the embedded-C subset used in the lab.

export type TokKind = 'id' | 'num' | 'float' | 'char' | 'str' | 'punct' | 'eof';

export interface Token {
  k: TokKind;
  v: string;          // raw text / identifier / punctuator / decoded string
  n?: number;         // numeric value
  unsigned?: boolean; // integer suffix u/U
  long?: number;      // count of l/L suffixes
  isF32?: boolean;    // float suffix f/F
  file: string;
  line: number;
  col: number;
  // set by the preprocessor to avoid recursive macro expansion
  hide?: Set<string>;
}

export class CError extends Error {
  constructor(msg: string, public file: string, public line: number, public col = 0) {
    super(msg);
  }
}

const PUNCTS = [
  '...', '<<=', '>>=',
  '->', '++', '--', '<<', '>>', '<=', '>=', '==', '!=', '&&', '||',
  '+=', '-=', '*=', '/=', '%=', '&=', '|=', '^=', '##',
  '+', '-', '*', '/', '%', '&', '|', '^', '~', '!', '<', '>', '=', '?', ':',
  ';', ',', '.', '(', ')', '[', ']', '{', '}', '#',
];

export function decodeEscape(s: string, i: number): [number, number] {
  // s[i] is the char after the backslash; returns [code, next index]
  const c = s[i];
  switch (c) {
    case 'n': return [10, i + 1];
    case 't': return [9, i + 1];
    case 'r': return [13, i + 1];
    case '0': case '1': case '2': case '3': case '4': case '5': case '6': case '7': {
      let j = i, v = 0;
      while (j < s.length && j < i + 3 && s[j] >= '0' && s[j] <= '7') { v = v * 8 + (s.charCodeAt(j) - 48); j++; }
      return [v & 0xff, j];
    }
    case 'x': {
      let j = i + 1, v = 0;
      while (j < s.length && /[0-9a-fA-F]/.test(s[j])) { v = v * 16 + parseInt(s[j], 16); j++; }
      return [v & 0xff, j];
    }
    case 'a': return [7, i + 1];
    case 'b': return [8, i + 1];
    case 'f': return [12, i + 1];
    case 'v': return [11, i + 1];
    case 'e': return [27, i + 1];
    default: return [s.charCodeAt(i), i + 1];
  }
}

/** Tokenize a single logical line (comments already stripped). */
export function tokenizeLine(src: string, file: string, line: number): Token[] {
  const out: Token[] = [];
  let i = 0;
  const n = src.length;
  while (i < n) {
    const c = src[i];
    if (c === ' ' || c === '\t' || c === '\r' || c === '\f' || c === '\v') { i++; continue; }
    const col = i + 1;
    // identifiers
    if (/[A-Za-z_]/.test(c)) {
      let j = i + 1;
      while (j < n && /[A-Za-z0-9_]/.test(src[j])) j++;
      out.push({ k: 'id', v: src.slice(i, j), file, line, col });
      i = j;
      continue;
    }
    // numbers
    if (/[0-9]/.test(c) || (c === '.' && /[0-9]/.test(src[i + 1] ?? ''))) {
      let j = i;
      let isFloat = false;
      if (c === '0' && (src[i + 1] === 'x' || src[i + 1] === 'X')) {
        j = i + 2;
        while (j < n && /[0-9a-fA-F]/.test(src[j])) j++;
      } else if (c === '0' && (src[i + 1] === 'b' || src[i + 1] === 'B')) {
        j = i + 2;
        while (j < n && /[01]/.test(src[j])) j++;
      } else {
        while (j < n && /[0-9]/.test(src[j])) j++;
        if (src[j] === '.') { isFloat = true; j++; while (j < n && /[0-9]/.test(src[j])) j++; }
        if (src[j] === 'e' || src[j] === 'E') {
          isFloat = true; j++;
          if (src[j] === '+' || src[j] === '-') j++;
          while (j < n && /[0-9]/.test(src[j])) j++;
        }
      }
      const body = src.slice(i, j);
      let unsigned = false, long = 0, isF32 = false;
      while (j < n && /[uUlLfF]/.test(src[j])) {
        const s = src[j];
        if (s === 'u' || s === 'U') unsigned = true;
        else if (s === 'l' || s === 'L') long++;
        else if ((s === 'f' || s === 'F') && (isFloat)) isF32 = true;
        else if (s === 'f' || s === 'F') { isF32 = true; isFloat = true; }
        j++;
      }
      if (j < n && /[A-Za-z0-9_]/.test(src[j])) {
        throw new CError(`Invalid numeric literal '${src.slice(i, j + 1)}'`, file, line, col);
      }
      let val: number;
      if (isFloat) val = parseFloat(body);
      else if (/^0[xX]/.test(body)) {
        if (body.length <= 2) throw new CError(`Invalid hex literal '${body}'`, file, line, col);
        val = parseInt(body.slice(2), 16);
      } else if (/^0[bB]/.test(body)) val = parseInt(body.slice(2), 2);
      else if (body.length > 1 && body[0] === '0') {
        if (/[89]/.test(body)) throw new CError(`Invalid octal literal '${body}'`, file, line, col);
        val = parseInt(body, 8);
      } else val = parseInt(body, 10);
      out.push({ k: isFloat ? 'float' : 'num', v: src.slice(i, j), n: val, unsigned, long, isF32, file, line, col });
      i = j;
      continue;
    }
    // char literal
    if (c === "'") {
      let j = i + 1;
      let v = 0;
      let count = 0;
      while (j < n && src[j] !== "'") {
        let code: number;
        if (src[j] === '\\') { [code, j] = decodeEscape(src, j + 1); }
        else { code = src.charCodeAt(j); j++; }
        v = ((v << 8) | (code & 0xff)) >>> 0;
        count++;
      }
      if (j >= n) throw new CError('Unterminated character literal', file, line, col);
      if (count === 0) throw new CError('Empty character literal', file, line, col);
      j++;
      // a single char literal has type int in C; keep its (signed char) value
      if (count === 1 && v > 127) v = v - 256;
      out.push({ k: 'char', v: src.slice(i, j), n: v, file, line, col });
      i = j;
      continue;
    }
    // string literal
    if (c === '"') {
      let j = i + 1;
      let s = '';
      while (j < n && src[j] !== '"') {
        if (src[j] === '\\') { let code: number; [code, j] = decodeEscape(src, j + 1); s += String.fromCharCode(code); }
        else { s += src[j]; j++; }
      }
      if (j >= n) throw new CError('Missing closing quote in string literal', file, line, col);
      j++;
      out.push({ k: 'str', v: s, file, line, col });
      i = j;
      continue;
    }
    // smart quotes pasted from PDFs are a common student mistake — be helpful
    if (c === '“' || c === '”' || c === '‘' || c === '’') {
      throw new CError(`Curly quote '${c}' found — replace it with a plain " or ' (common when copying from a PDF)`, file, line, col);
    }
    let matched = '';
    for (const p of PUNCTS) {
      if (src.startsWith(p, i)) { matched = p; break; }
    }
    if (!matched) {
      throw new CError(`Unexpected character '${c}'`, file, line, col);
    }
    out.push({ k: 'punct', v: matched, file, line, col });
    i += matched.length;
  }
  return out;
}

/** Remove comments, keeping newlines so that line numbers stay correct. */
export function stripComments(src: string): string {
  let out = '';
  let i = 0;
  const n = src.length;
  while (i < n) {
    const c = src[i];
    if (c === '/' && src[i + 1] === '/') {
      while (i < n && src[i] !== '\n') i++;
      continue;
    }
    if (c === '/' && src[i + 1] === '*') {
      i += 2;
      while (i < n && !(src[i] === '*' && src[i + 1] === '/')) {
        if (src[i] === '\n') out += '\n';
        i++;
      }
      i += 2;
      out += ' ';
      continue;
    }
    if (c === '"' || c === "'") {
      const q = c;
      out += c; i++;
      while (i < n && src[i] !== q && src[i] !== '\n') {
        if (src[i] === '\\') { out += src[i] + (src[i + 1] ?? ''); i += 2; continue; }
        out += src[i]; i++;
      }
      if (i < n && src[i] === q) { out += q; i++; }
      continue;
    }
    out += c;
    i++;
  }
  return out;
}
