import { CType, T, ptr, MK } from './types';
import type { VM } from './vm';

export interface BuiltinDef {
  name: string;
  ret: CType;
  params?: CType[];   // when given, args are converted to these types
  variadic?: boolean;
  impl: (vm: VM, a: number[]) => number;
}

const cstr = ptr(T.char);

/** printf-style formatting reading varargs from a JS array. */
export function formatC(vm: VM, fmt: string, args: number[]): string {
  let out = '';
  let ai = 0;
  for (let i = 0; i < fmt.length; i++) {
    const c = fmt[i];
    if (c !== '%') { out += c; continue; }
    i++;
    if (fmt[i] === '%') { out += '%'; continue; }
    let flags = '';
    while ('-+ 0#'.includes(fmt[i]) && i < fmt.length) flags += fmt[i++];
    let width = -1;
    if (fmt[i] === '*') { width = args[ai++] | 0; i++; }
    else { let w = ''; while (/[0-9]/.test(fmt[i])) w += fmt[i++]; if (w) width = parseInt(w, 10); }
    let prec = -1;
    if (fmt[i] === '.') {
      i++;
      if (fmt[i] === '*') { prec = args[ai++] | 0; i++; }
      else { let pr = ''; while (/[0-9]/.test(fmt[i])) pr += fmt[i++]; prec = pr ? parseInt(pr, 10) : 0; }
    }
    let len = '';
    while ('hlLqjzt'.includes(fmt[i]) && i < fmt.length) len += fmt[i++];
    const conv = fmt[i];
    const arg = args[ai++] ?? 0;
    let s = '';
    let numeric = true;
    let neg = false;
    switch (conv) {
      case 'd': case 'i': {
        let v = len.includes('h') ? (len === 'hh' ? (arg << 24) >> 24 : (arg << 16) >> 16) : (len.length >= 2 && len.includes('l') ? Math.trunc(arg) : arg | 0);
        neg = v < 0; s = Math.abs(v).toString();
        if (prec >= 0) s = s.padStart(prec, '0');
        break;
      }
      case 'u': {
        const v = len === 'hh' ? arg & 0xff : len === 'h' ? arg & 0xffff : arg >>> 0;
        s = v.toString(); if (prec >= 0) s = s.padStart(prec, '0'); break;
      }
      case 'x': case 'X': {
        const v = len === 'hh' ? arg & 0xff : len === 'h' ? arg & 0xffff : arg >>> 0;
        s = v.toString(16); if (conv === 'X') s = s.toUpperCase();
        if (prec >= 0) s = s.padStart(prec, '0');
        if (flags.includes('#') && v !== 0) s = (conv === 'X' ? '0X' : '0x') + s;
        break;
      }
      case 'o': s = (arg >>> 0).toString(8); break;
      case 'c': s = String.fromCharCode(arg & 0xff); numeric = false; break;
      case 's': s = arg ? vm.readCString(arg) : '(null)'; if (prec >= 0) s = s.slice(0, prec); numeric = false; break;
      case 'p': s = '0x' + (arg >>> 0).toString(16).padStart(8, '0'); numeric = false; break;
      case 'f': case 'F': { neg = arg < 0 || Object.is(arg, -0); s = Math.abs(arg).toFixed(prec < 0 ? 6 : prec); break; }
      case 'e': case 'E': { neg = arg < 0; s = Math.abs(arg).toExponential(prec < 0 ? 6 : prec).replace(/e([+-])(\d)$/, 'e$10$2'); if (conv === 'E') s = s.toUpperCase(); break; }
      case 'g': case 'G': {
        neg = arg < 0;
        const p = prec < 0 ? 6 : prec === 0 ? 1 : prec;
        const v = Math.abs(arg);
        const exp = v === 0 ? 0 : Math.floor(Math.log10(v));
        if (exp < -4 || exp >= p) s = v.toExponential(p - 1).replace(/\.?0+e/, 'e').replace(/e([+-])(\d)$/, 'e$10$2');
        else s = v.toFixed(Math.max(0, p - 1 - exp));
        if (!flags.includes('#') && s.includes('.') && !s.includes('e')) s = s.replace(/\.?0+$/, '');
        if (conv === 'G') s = s.toUpperCase();
        break;
      }
      default:
        s = '%' + flags + (conv ?? ''); numeric = false; ai--;
    }
    if (numeric) {
      const sign = neg ? '-' : flags.includes('+') ? '+' : flags.includes(' ') ? ' ' : '';
      if (flags.includes('0') && !flags.includes('-') && width > 0 && !(prec >= 0 && 'diuxX'.includes(conv))) s = sign + s.padStart(width - sign.length, '0');
      else s = sign + s;
    }
    if (width > 0 && s.length < width) s = flags.includes('-') ? s.padEnd(width) : s.padStart(width);
    out += s;
  }
  return out;
}

function writeStr(vm: VM, addr: number, s: string) {
  for (let i = 0; i < s.length; i++) vm.write(addr + i, MK.U8, s.charCodeAt(i) & 0xff);
  vm.write(addr + s.length, MK.U8, 0);
}

let randState = 1;

const host = (vm: VM) => (vm as any).host as {
  nvicEnable(irq: number): void; nvicDisable(irq: number): void; nvicSetPending(irq: number): void; nvicClearPending(irq: number): void;
  sysTickConfig(ticks: number): number;
} | undefined;

export const BUILTINS: BuiltinDef[] = [
  { name: 'SystemInit', ret: T.void, impl: () => 0 },
  { name: 'SystemCoreClockUpdate', ret: T.void, impl: () => 0 },
  { name: 'NVIC_EnableIRQ', ret: T.void, params: [T.int], impl: (vm, a) => { host(vm)?.nvicEnable(a[0]); return 0; } },
  { name: 'NVIC_DisableIRQ', ret: T.void, params: [T.int], impl: (vm, a) => { host(vm)?.nvicDisable(a[0]); return 0; } },
  { name: 'NVIC_SetPendingIRQ', ret: T.void, params: [T.int], impl: (vm, a) => { host(vm)?.nvicSetPending(a[0]); return 0; } },
  { name: 'NVIC_ClearPendingIRQ', ret: T.void, params: [T.int], impl: (vm, a) => { host(vm)?.nvicClearPending(a[0]); return 0; } },
  { name: 'NVIC_SetPriority', ret: T.void, params: [T.int, T.uint], impl: () => 0 },
  { name: 'NVIC_SetPriorityGrouping', ret: T.void, params: [T.uint], impl: () => 0 },
  { name: 'SysTick_Config', ret: T.uint, params: [T.uint], impl: (vm, a) => host(vm)?.sysTickConfig(a[0]) ?? 1 },
  { name: '__enable_irq', ret: T.void, impl: (vm) => { vm.primask = false; vm.irqCheck = true; return 0; } },
  { name: '__disable_irq', ret: T.void, impl: (vm) => { vm.primask = true; return 0; } },
  { name: '__NOP', ret: T.void, impl: () => 0 },
  { name: '__nop', ret: T.void, impl: () => 0 },
  { name: '__WFI', ret: T.void, impl: () => 0 },
  { name: '__wfi', ret: T.void, impl: () => 0 },

  { name: 'printf', ret: T.int, params: [cstr], variadic: true, impl: (vm, a) => { const s = formatC(vm, vm.readCString(a[0]), a.slice(1)); vm.stdout(s); return s.length; } },
  { name: 'puts', ret: T.int, params: [cstr], impl: (vm, a) => { vm.stdout(vm.readCString(a[0]) + '\n'); return 0; } },
  { name: 'putchar', ret: T.int, params: [T.int], impl: (vm, a) => { vm.stdout(String.fromCharCode(a[0] & 0xff)); return a[0]; } },
  { name: 'sprintf', ret: T.int, params: [cstr, cstr], variadic: true, impl: (vm, a) => { const s = formatC(vm, vm.readCString(a[1]), a.slice(2)); writeStr(vm, a[0], s); return s.length; } },
  { name: 'snprintf', ret: T.int, params: [cstr, T.uint, cstr], variadic: true, impl: (vm, a) => { let s = formatC(vm, vm.readCString(a[2]), a.slice(3)); const full = s.length; if (a[1] > 0) { s = s.slice(0, a[1] - 1); writeStr(vm, a[0], s); } return full; } },
  { name: 'strlen', ret: T.uint, params: [cstr], impl: (vm, a) => vm.readCString(a[0]).length },
  { name: 'strcpy', ret: cstr, params: [cstr, cstr], impl: (vm, a) => { writeStr(vm, a[0], vm.readCString(a[1])); return a[0]; } },
  { name: 'strncpy', ret: cstr, params: [cstr, cstr, T.uint], impl: (vm, a) => { const s = vm.readCString(a[1]); for (let i = 0; i < a[2]; i++) vm.write(a[0] + i, MK.U8, i < s.length ? s.charCodeAt(i) : 0); return a[0]; } },
  { name: 'strcat', ret: cstr, params: [cstr, cstr], impl: (vm, a) => { const d = vm.readCString(a[0]); writeStr(vm, a[0] + d.length, vm.readCString(a[1])); return a[0]; } },
  { name: 'strcmp', ret: T.int, params: [cstr, cstr], impl: (vm, a) => { const x = vm.readCString(a[0]), y = vm.readCString(a[1]); return x < y ? -1 : x > y ? 1 : 0; } },
  { name: 'strncmp', ret: T.int, params: [cstr, cstr, T.uint], impl: (vm, a) => { const x = vm.readCString(a[0]).slice(0, a[2]), y = vm.readCString(a[1]).slice(0, a[2]); return x < y ? -1 : x > y ? 1 : 0; } },
  { name: 'memset', ret: ptr(T.void), params: [ptr(T.void), T.int, T.uint], impl: (vm, a) => { for (let i = 0; i < a[2]; i++) vm.write(a[0] + i, MK.U8, a[1]); return a[0]; } },
  { name: 'memcpy', ret: ptr(T.void), params: [ptr(T.void), ptr(T.void), T.uint], impl: (vm, a) => { for (let i = 0; i < a[2]; i++) vm.write(a[0] + i, MK.U8, vm.read(a[1] + i, MK.U8)); return a[0]; } },
  { name: 'abs', ret: T.int, params: [T.int], impl: (_, a) => Math.abs(a[0]) | 0 },
  { name: 'labs', ret: T.int, params: [T.int], impl: (_, a) => Math.abs(a[0]) | 0 },
  { name: 'atoi', ret: T.int, params: [cstr], impl: (vm, a) => parseInt(vm.readCString(a[0]), 10) | 0 },
  { name: 'rand', ret: T.int, impl: () => { randState = (Math.imul(randState, 1103515245) + 12345) >>> 0; return (randState >>> 16) & 0x7fff; } },
  { name: 'srand', ret: T.void, params: [T.uint], impl: (_, a) => { randState = a[0] >>> 0; return 0; } },
  { name: 'toupper', ret: T.int, params: [T.int], impl: (_, a) => (a[0] >= 97 && a[0] <= 122 ? a[0] - 32 : a[0]) },
  { name: 'tolower', ret: T.int, params: [T.int], impl: (_, a) => (a[0] >= 65 && a[0] <= 90 ? a[0] + 32 : a[0]) },
  { name: 'isdigit', ret: T.int, params: [T.int], impl: (_, a) => +(a[0] >= 48 && a[0] <= 57) },
  { name: 'isalpha', ret: T.int, params: [T.int], impl: (_, a) => +((a[0] | 32) >= 97 && (a[0] | 32) <= 122) },
  { name: 'sin', ret: T.double, params: [T.double], impl: (_, a) => Math.sin(a[0]) },
  { name: 'cos', ret: T.double, params: [T.double], impl: (_, a) => Math.cos(a[0]) },
  { name: 'tan', ret: T.double, params: [T.double], impl: (_, a) => Math.tan(a[0]) },
  { name: 'sqrt', ret: T.double, params: [T.double], impl: (_, a) => Math.sqrt(a[0]) },
  { name: 'pow', ret: T.double, params: [T.double, T.double], impl: (_, a) => Math.pow(a[0], a[1]) },
  { name: 'fabs', ret: T.double, params: [T.double], impl: (_, a) => Math.abs(a[0]) },
  { name: 'floor', ret: T.double, params: [T.double], impl: (_, a) => Math.floor(a[0]) },
  { name: 'ceil', ret: T.double, params: [T.double], impl: (_, a) => Math.ceil(a[0]) },
  { name: 'round', ret: T.double, params: [T.double], impl: (_, a) => Math.sign(a[0]) * Math.round(Math.abs(a[0])) },
  { name: 'log', ret: T.double, params: [T.double], impl: (_, a) => Math.log(a[0]) },
  { name: 'log10', ret: T.double, params: [T.double], impl: (_, a) => Math.log10(a[0]) },
  { name: 'exp', ret: T.double, params: [T.double], impl: (_, a) => Math.exp(a[0]) },
  { name: 'sinf', ret: T.float, params: [T.float], impl: (_, a) => Math.fround(Math.sin(a[0])) },
  { name: 'cosf', ret: T.float, params: [T.float], impl: (_, a) => Math.fround(Math.cos(a[0])) },
  { name: 'sqrtf', ret: T.float, params: [T.float], impl: (_, a) => Math.fround(Math.sqrt(a[0])) },
];

export const BUILTIN_INDEX = new Map(BUILTINS.map((b, i) => [b.name, i]));
