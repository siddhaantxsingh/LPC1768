export type CType =
  | { k: 'void' }
  | { k: 'int'; size: 1 | 2 | 4 | 8; signed: boolean; bool?: boolean }
  | { k: 'float'; size: 4 | 8 }
  | { k: 'ptr'; to: CType }
  | { k: 'arr'; of: CType; len: number | null }
  | { k: 'struct'; name: string; union: boolean; fields: Field[] | null; size: number; align: number }
  | { k: 'enum'; name: string }
  | { k: 'func'; ret: CType; params: CType[]; variadic: boolean; oldStyle?: boolean };

export interface Field { name: string; type: CType; offset: number }

export const T = {
  void: { k: 'void' } as CType,
  char: { k: 'int', size: 1, signed: true } as CType,
  uchar: { k: 'int', size: 1, signed: false } as CType,
  short: { k: 'int', size: 2, signed: true } as CType,
  ushort: { k: 'int', size: 2, signed: false } as CType,
  int: { k: 'int', size: 4, signed: true } as CType,
  uint: { k: 'int', size: 4, signed: false } as CType,
  llong: { k: 'int', size: 8, signed: true } as CType,
  ullong: { k: 'int', size: 8, signed: false } as CType,
  bool: { k: 'int', size: 1, signed: false, bool: true } as CType,
  float: { k: 'float', size: 4 } as CType,
  double: { k: 'float', size: 8 } as CType,
};

export const ptr = (to: CType): CType => ({ k: 'ptr', to });

export function sizeOf(t: CType): number {
  switch (t.k) {
    case 'void': return 1;
    case 'int': return t.size;
    case 'enum': return 4;
    case 'float': return t.size;
    case 'ptr': return 4;
    case 'arr': return t.len === null ? 0 : t.len * sizeOf(t.of);
    case 'struct': return t.size;
    case 'func': return 4;
  }
}

export function alignOf(t: CType): number {
  switch (t.k) {
    case 'int': return Math.min(t.size, 8);
    case 'float': return t.size;
    case 'arr': return alignOf(t.of);
    case 'struct': return t.align;
    default: return 4;
  }
}

export const isInt = (t: CType) => t.k === 'int' || t.k === 'enum';
export const isFloat = (t: CType) => t.k === 'float';
export const isArith = (t: CType) => isInt(t) || isFloat(t);
export const isPtr = (t: CType) => t.k === 'ptr';
export const isScalar = (t: CType) => isArith(t) || isPtr(t);

/** Integer promotion: anything narrower than int becomes int. */
export function promote(t: CType): CType {
  if (t.k === 'enum') return T.int;
  if (t.k === 'int' && t.size < 4) return T.int;
  return t;
}

/** Usual arithmetic conversions. */
export function arithResult(a: CType, b: CType): CType {
  if (isFloat(a) || isFloat(b)) {
    const sa = isFloat(a) ? (a as any).size : 0;
    const sb = isFloat(b) ? (b as any).size : 0;
    return Math.max(sa, sb) === 8 ? T.double : T.float;
  }
  const pa = promote(a) as any, pb = promote(b) as any;
  if (pa.size === 8 || pb.size === 8) {
    if ((pa.size === 8 && !pa.signed) || (pb.size === 8 && !pb.signed)) return T.ullong;
    return T.llong;
  }
  if (!pa.signed || !pb.signed) return T.uint;
  return T.int;
}

export function decay(t: CType): CType {
  if (t.k === 'arr') return ptr(t.of);
  if (t.k === 'func') return ptr(t);
  return t;
}

export function typeName(t: CType): string {
  switch (t.k) {
    case 'void': return 'void';
    case 'int': {
      if (t.bool) return '_Bool';
      const base = t.size === 1 ? 'char' : t.size === 2 ? 'short' : t.size === 4 ? 'int' : 'long long';
      return (t.signed ? '' : 'unsigned ') + base;
    }
    case 'enum': return 'enum ' + t.name;
    case 'float': return t.size === 4 ? 'float' : 'double';
    case 'ptr': return typeName(t.to) + ' *';
    case 'arr': return typeName(t.of) + `[${t.len ?? ''}]`;
    case 'struct': return (t.union ? 'union ' : 'struct ') + t.name;
    case 'func': return typeName(t.ret) + ' (*)(' + t.params.map(typeName).join(', ') + ')';
  }
}

/** Memory access kinds used by the VM. */
export const enum MK { I8 = 0, U8 = 1, I16 = 2, U16 = 3, I32 = 4, U32 = 5, F32 = 6, F64 = 7 }

export function memKind(t: CType): MK {
  switch (t.k) {
    case 'int':
      if (t.size === 1) return t.signed ? MK.I8 : MK.U8;
      if (t.size === 2) return t.signed ? MK.I16 : MK.U16;
      if (t.size === 8) return MK.F64; // 64-bit ints are approximated with doubles
      return t.signed ? MK.I32 : MK.U32;
    case 'enum': return MK.I32;
    case 'float': return t.size === 4 ? MK.F32 : MK.F64;
    default: return MK.U32;
  }
}

export function sameType(a: CType, b: CType): boolean {
  if (a.k !== b.k) return false;
  switch (a.k) {
    case 'int': return a.size === (b as any).size && a.signed === (b as any).signed;
    case 'float': return a.size === (b as any).size;
    case 'ptr': return sameType(a.to, (b as any).to);
    case 'arr': return sameType(a.of, (b as any).of);
    case 'struct': return a === b || a.name === (b as any).name;
    default: return true;
  }
}
