// Every program and exercise in the manual is compiled/assembled and run on the
// simulated board; the observable result is checked.
import { describe, expect, it } from 'vitest';
import { readFileSync, readdirSync } from 'node:fs';
import { compile, Session } from '../src/sim/runner';
import { Board } from '../src/sim/board/machine';
import { assemble } from '../src/sim/arm/assembler';
import { ArmCpu } from '../src/sim/arm/cpu';

const rd = (f: string) => readFileSync('src/content/code/' + f, 'utf8');
const lcdFiles = { 'lcd.c': rd('lcd_lib.c'), 'AN_LCD.h': rd('AN_LCD.h') };

function boot(file: string, cables: any, jumpers: Partial<{ JP5: boolean; JP16: boolean; JP18: boolean }> = {}, rate = 2_000_000) {
  const files: Record<string, string> = { 'main.c': rd(file) };
  if (files['main.c'].includes('AN_LCD.h')) Object.assign(files, lcdFiles);
  const r = compile(files);
  if (!r.ok) throw new Error(file + ': ' + r.diagnostics.map(d => `${d.file}:${d.line} ${d.msg}`).join('; '));
  const b = new Board();
  b.rewire({ cables, jumpers: { JP5: true, JP16: true, JP18: true, JP7: true, JP8: true, ...jumpers } });
  const s = new Session(r.out!, b);
  b.setRate(rate);
  return { b, s };
}
const segs = (b: Board, s: Session, ops = 60000) => { b.snapshot(0); s.runOps(ops); return b.snapshot(0).seg.map(r => r.map(x => (x > 0.05 ? 1 : 0)).join('')); };
const SEG = (c: string) => ({ H: '01101110', E: '10011110', L: '00011100', P: '11001110', C: '10011100', F: '10001110', A: '11101110', ' ': '00000000' } as Record<string, string>)[c];

describe('C compiler', () => {
  it('reports a missing semicolon on the right line', () => {
    const r = compile({ 'main.c': 'int main(void)\n{\n  int x = 1\n  return x;\n}\n' });
    expect(r.ok).toBe(false);
    expect(r.diagnostics[0].line).toBe(3);
    expect(r.diagnostics[0].msg).toMatch(/;/);
  });
  it('suggests the right case for a misspelt register', () => {
    const r = compile({ 'main.c': '#include <LPC17xx.h>\nint main(void){ LPC_GPIO0->fioset = 1; while(1); }' });
    expect(r.diagnostics[0].msg).toMatch(/FIOSET/);
  });
  it('handles integer semantics, structs, pointers and sprintf', () => {
    const r = compile({
      'main.c': `#include <stdio.h>
struct P { int x; unsigned char y; };
char buf[40];
int main(void) {
  struct P p; struct P *q = &p; unsigned char c = 250; int i; int a[5] = {1,2,3};
  q->x = -7; p.y = c + 10; c += 10;
  for (i = 0; i < 5; i++) a[i] *= 2;
  sprintf(buf, "%d %u %x %5.2f %s|%-3d|", q->x / 2, (unsigned)-1, p.y, 3.14159, "ok", a[2]);
  return (c == 4) && (a[4] == 0) && (-7 % 3 == -1) && ((unsigned)-8 >> 28 == 15) && (-8 >> 1 == -4);
}`,
    });
    expect(r.ok).toBe(true);
    const b = new Board();
    const s = new Session(r.out!, b);
    s.runOps(100000);
    expect(s.vm.halted).toBe(true);
    const g = r.out!.globals.find(x => x.name === 'buf')!;
    expect(s.vm.readCString(g.addr)).toBe('-3 4294967295 4  3.14 ok|6  |');
  });
});

describe('Experiment 5–10 manual programs', () => {
  it('E5 P1 blinks LD2–LD9', () => {
    const { b, s } = boot('e5p1_blink.c', { CNA: 'CNA1' });
    s.runOps(150000); const a = b.ports[0].latch & 0xff0;
    s.runOps(200000); const c = b.ports[0].latch & 0xff0;
    expect(new Set([a, c])).toEqual(new Set([0, 0xff0]));
  });
  it('E5 P2 toggles the buzzer', () => {
    const { b, s } = boot('e5p2_buzzer.c', { CNA: 'CNA5' });
    b.snapshot(0); s.runOps(800000);
    const snap = b.snapshot(0);
    expect(snap.buzzer.duty).toBeGreaterThan(0.3);
    expect(snap.buzzer.duty).toBeLessThan(0.7);
  });
  it('E6 P1 writes the message to the LCD', () => {
    const { b, s } = boot('e6p1_lcd.c', { CND: 'CNAD' });
    s.runOps(4_000_000);
    expect(b.lcd.text()[0]).toBe('ECE,MIT,MANIPAL ');
  });
  it('E6 P2 shows HELP', () => {
    const { b, s } = boot('e6p2_help.c', { CNA: 'CNA2', CNB: 'CNB2' });
    s.runOps(200000);
    expect(segs(b, s)).toEqual(['H', 'E', 'L', 'P'].map(SEG));
  });
  it('E7 P1 shows the pot voltage and code', () => {
    const { b, s } = boot('e7p1_adc.c', { CND: 'CNAD' });
    b.potVolts[0] = 2.0; b.adcNoise = false;
    s.runOps(8_000_000);
    expect(b.lcd.text()).toEqual(['ANALOG IP:2.00V ', 'ADC OUTPUT:9b2  ']);
  });
  it('E7 P2 produces a ramp', () => {
    const { b, s } = boot('e7p2_dac.c', {}, { JP5: false });
    s.runOps(500000);
    expect(b.dacCount).toBeGreaterThan(300);
  });
  it('E8 P1 runs the K4 counter', () => {
    const { b, s } = boot('e8p1_keys.c', { CNA: 'CNA1', CNB: 'CNB3' });
    b.pressKey(3, true);
    const seen = new Set<number>();
    for (let i = 0; i < 40; i++) { s.runOps(20000); seen.add(b.ports[0].latch & 0xff0); }
    expect([...seen].some(v => v !== 0)).toBe(true);
  });
  it('E8 P2 echoes UART3', () => {
    const { b, s } = boot('e8p2_uart.c', {});
    s.runOps(20000);
    for (const ch of 'MES') { b.uartReceive(3, ch.charCodeAt(0)); s.runOps(20000); }
    expect(b.uarts[3].out).toBe('MES');
    for (const ch of ' burst of text') b.uartReceive(3, ch.charCodeAt(0)); // pasted all at once
    s.runOps(400000);
    expect(b.uarts[3].out).toBe('MES burst of text');
  });
  it('E9 P1 turns the stepper one revolution', () => {
    const { b, s } = boot('e9p1_stepper.c', { CNA: 'CNA5' });
    let peak = 0;
    for (let i = 0; i < 110; i++) { s.runOps(50000); peak = Math.max(peak, b.stepperPos * 0.9); }
    expect(peak).toBeCloseTo(360, 0);
  });
  it('E9 P2 reverses the DC motor', () => {
    const { b, s } = boot('e9p2_dc.c', { CNA: 'CNA5' });
    const dirs = new Set<number>();
    for (let i = 0; i < 30; i++) { s.runOps(150000); dirs.add((b.ports[0].latch >> 10) & 1); }
    expect(dirs.size).toBe(2);
  });
  it('E10 P1 toggles LD10 on SW2', () => {
    const { b, s } = boot('e10p1_eint.c', { CNB: 'CNB1' });
    s.runOps(20000);
    expect((b.ports[1].latch >> 23) & 1).toBe(1);
    b.setSw2(true); s.runOps(20000); b.setSw2(false); s.runOps(20000);
    expect((b.ports[1].latch >> 23) & 1).toBe(0);
  });
});

describe('Experiment 5–10 exercise solutions', () => {
  it('compile without errors', () => {
    for (const f of readdirSync('src/content/code/ex').filter(x => x.endsWith('.c'))) {
      const files: Record<string, string> = { 'main.c': rd('ex/' + f) };
      if (files['main.c'].includes('AN_LCD.h')) Object.assign(files, lcdFiles);
      const r = compile(files);
      expect(r.ok, f + ' ' + JSON.stringify(r.diagnostics)).toBe(true);
    }
  });
  it('E6 X1 shows ECE', () => {
    const { b, s } = boot('ex/e6x1.c', { CNA: 'CNA2', CNB: 'CNB2' });
    s.runOps(100000);
    expect(segs(b, s, 50000)).toEqual([' ', 'E', 'C', 'E'].map(SEG));
  });
  it('E7 X3 makes a 1 kHz, 3 Vpp sine', () => {
    const { b, s } = boot('ex/e7x3.c', {}, { JP5: false }, 32_000_000);
    s.runOps(3_000_000);
    const vs: number[] = []; const N = b.dacN;
    for (let i = 1; i <= 80; i++) vs.push(b.dacV[(b.dacHead - i) & (N - 1)]);
    expect(Math.min(...vs)).toBeCloseTo(0.15, 1);
    expect(Math.max(...vs)).toBeCloseTo(3.15, 1);
    const span = b.dacT[(b.dacHead - 1) & (N - 1)] - b.dacT[(b.dacHead - 41) & (N - 1)];
    expect(span / 1e6).toBeCloseTo(1.0, 1); // 40 samples = 1 ms
  });
  it('E8 X3 shows the pressed key', () => {
    const { b, s } = boot('ex/e8x3.c', { CNA: 'CNA2', CNB: 'CNB3', CNC: 'CNB2' });
    b.pressKey(10, true);
    s.runOps(200000);
    expect(segs(b, s, 20000)[3]).toBe(SEG('A'));
  });
  it('E9 X1 turns exactly 180° anticlockwise', () => {
    const { b, s } = boot('ex/e9x1.c', { CNA: 'CNA5' });
    s.runOps(3_000_000);
    expect(b.stepperPos * 0.9).toBeCloseTo(-180, 1);
  });
  it('E10 X3 cycles motor speeds', () => {
    const { b, s } = boot('ex/e10x3.c', { CNA: 'CNA5', CNB: 'CNB1' });
    const duties: number[] = [];
    for (let i = 0; i < 4; i++) {
      b.snapshot(0); s.runOps(300000); duties.push(+b.snapshot(0).dc.duty.toFixed(1));
      b.setSw2(true); s.runOps(2000); b.setSw2(false);
    }
    expect(duties).toEqual([0, 0.3, 0.6, 1]);
  });
});

describe('ARM7 assembly', () => {
  const run = (file: string) => {
    const r = assemble(rd(file));
    if (!r.ok) throw new Error(file + ' ' + JSON.stringify(r.diags));
    const cpu = new ArmCpu(r);
    expect(cpu.run(200000)).toBe('halt');
    const mem = (label: string, i = 0) => cpu.peek32(r.symbols.get(label)!.value + i * 4);
    return { cpu, mem };
  };
  it('rejects an unencodable MOV immediate (Exp 1 P4)', () => {
    const r = assemble(rd('e1p4_logic.s'));
    expect(r.ok).toBe(false);
    expect(r.diags[0].msg).toMatch(/cannot be encoded/);
  });
  it.each([
    ['e1p1_addsub.s', (c: ArmCpu) => [c.r[2], c.r[3]], [0x30, 0x10]],
    ['e1p3_mla.s', (c: ArmCpu) => [c.r[3]], [70]],
    ['e1p10_ror.s', (c: ArmCpu) => [c.r[1]], [0x81234567]],
    ['e2p1_sign.s', (c: ArmCpu) => [c.r[1]], [0xffffffff]],
  ])('%s', (f, get, want) => { const { cpu } = run(f as string); expect((get as any)(cpu)).toEqual(want); });
  it('memory results', () => {
    expect(run('e2p4_sumn.s').mem('RESULT')).toBe(55);
    expect(run('e2p5_gcd.s').mem('RESULT')).toBe(6);
    expect(run('e3p1_table.s').mem('RESULT', 9)).toBe(50);
    expect(run('e3p2_largest.s').mem('RESULT')).toBe(90);
    expect(run('e3p3_search.s').mem('RESULT')).toBe(2);
    expect(run('e3p4_strlen.s').mem('COUNT')).toBe(12);
    expect(run('e3p5_charcount.s').mem('COUNT')).toBe(4);
    expect(run('e4p1_mulsub.s').mem('RESULT')).toBe(375);
    expect(run('e4p2_arraysum.s').mem('RESULT')).toBe(150);
    const a = run('e4p4_add64.s'); expect([a.mem('RESULT'), a.mem('RESULT', 1)]).toEqual([0, 4]);
    expect(run('e4p5_multiword.s').mem('DEST', 14)).toBe(15);
  });
  it('exercise solutions', () => {
    expect(run('ex/e2x5.s').mem('RESULT')).toBe(720);
    expect(run('ex/e3x3.s').mem('DST')).toBe(5);
    expect(run('ex/e3x5.s').mem('RESULT')).toBe(1);
    const s = run('ex/e3x6.s'); expect([0, 1, 2, 3, 4, 5].map(i => s.mem('ARRAY', i) | 0)).toEqual([-7, 0, 3, 19, 44, 88]);
    const m = run('ex/e4x3.s'); expect([0, 1, 2, 3].map(i => m.mem('PRODUCT', i))).toEqual([0x9abcdef0, 0x9be02467, 0x01234567, 0]);
    expect(run('ex/e4x4.s').mem('RESULT')).toBe(5040);
    expect(run('ex/e4x5.s').mem('RESULT')).toBe(0x8245);
    for (const f of readdirSync('src/content/code/ex').filter(x => x.endsWith('.s'))) {
      const r = assemble(rd('ex/' + f));
      expect(r.ok, f).toBe(true);
      expect(new ArmCpu(r).run(200000), f).toBe('halt');
    }
  });
});

describe('board reuse between programs', () => {
  it('timers keep working after a previous program ran for a while', () => {
    const first = compile({ 'main.c': rd('e5p1_blink.c') });
    const b = new Board();
    b.rewire({ cables: {}, jumpers: { JP5: false, JP16: true, JP18: true } });
    const s1 = new Session(first.out!, b);
    s1.advance(3e9); // 3 s of simulated time
    const r = compile({ 'main.c': rd('ex/e7x2.c') });
    const s2 = new Session(r.out!, b); // same board, like switching programs in the UI
    s2.runOps(400000);
    const vs = new Set<number>();
    for (let i = 1; i < 40; i++) vs.add(+b.dacV[(b.dacHead - i) & (b.dacN - 1)].toFixed(2));
    expect(vs.has(0)).toBe(true);
    expect(vs.has(3.3)).toBe(true);
  });
});

describe('real-board safety checks', () => {
  it('warns when a local is read before it is set', () => {
    const r = compile({ 'main.c': 'int main(void) {\n  unsigned int i, total;\n  for (i = 0; i < 3; i++) total += i;\n  while (1);\n}\n' });
    expect(r.ok).toBe(true);
    expect(r.diagnostics.some(d => d.line === 3 && /total.*before it is given a value/.test(d.msg))).toBe(true);
    expect(r.diagnostics.some(d => /'i'/.test(d.msg))).toBe(false);
  });
  it('uninitialised locals hold junk, like real RAM', () => {
    const r = compile({ 'main.c': 'unsigned int seen;\nint main(void) { unsigned int x; seen = x; while (1); }\n' });
    const b = new Board(); const s = new Session(r.out!, b); s.runOps(2000);
    expect(s.vm.read(r.out!.globals.find(g => g.name === 'seen')!.addr, 5)).not.toBe(0);
  });
  it('flags Keil column-1 layout mistakes', () => {
    const r = assemble('    AREA T, CODE, READONLY\n    ENTRY\nMOV R0, #1\n    LOOP B LOOP\n    END\n');
    expect(r.diags.some(d => d.line === 3 && d.msg.startsWith('Keil'))).toBe(true);
    expect(r.diags.some(d => d.line === 4 && d.msg.startsWith('Keil'))).toBe(true);
  });
  it('debounced EINT2 solution advances once per press even with switch bounce', () => {
    const { b, s } = boot('ex/e10x3.c', { CNA: 'CNA5', CNB: 'CNB1' });
    b.bounce = true;
    const duties: number[] = [];
    for (let i = 0; i < 4; i++) {
      b.snapshot(0); s.runOps(300000); duties.push(+b.snapshot(0).dc.duty.toFixed(1));
      b.setSw2(true); s.runOps(20000); b.setSw2(false); s.runOps(20000);
    }
    expect(duties).toEqual([0, 0.3, 0.6, 1]);
  });
  it('timer prescalers are computed from the real clock (100 MHz and 12 MHz boards)', () => {
    const pr = (cclk: number | null) => {
      let src = rd('ex/e5x4.c');
      if (cclk) src = src.replace('SystemCoreClockUpdate();', `SystemCoreClockUpdate();\n    SystemCoreClock = ${cclk};`);
      const r = compile({ 'main.c': src });
      const b = new Board(); const s = new Session(r.out!, b);
      s.runOps(20000);
      return b.timers[0].pr;
    };
    expect(pr(null)).toBe(24);       // 100 MHz, PCLK 25 MHz -> 1 us ticks
    expect(pr(12000000)).toBe(2);    // 12 MHz,  PCLK 3 MHz  -> still 1 us ticks
  });
});
