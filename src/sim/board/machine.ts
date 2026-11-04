import type { Bus, VM } from '../c/vm';
import { HD44780 } from './lcd';
import { PinRef, Socket, Wiring, emptyWiring, socketLine } from './wiring';

export const CCLK = 100_000_000;
const PCLK_DIV = [4, 1, 2, 8];

// GPIO / peripheral base addresses
const GPIO_BASE = 0x2009c000;
const PINCON = 0x4002c000;
const SC = 0x400fc000;
const ADC = 0x40034000;
const DAC = 0x4008c000;
const PWM1 = 0x40018000;
const GPIOINT = 0x40028080;
const SYSTICK = 0xe000e010;
const UART_BASES = [0x4000c000, 0x40010000, 0x40098000, 0x4009c000];
const TIMER_BASES = [0x40004000, 0x40008000, 0x40090000, 0x40094000];

interface Port { dir: number; mask: number; latch: number }

class TimerCore {
  ir = 0; tcr = 0; tc = 0; pr = 0; pc = 0; mcr = 0; ctcr = 0; emr = 0; ccr = 0;
  mr: number[];
  lastNs = 0;
  frac = 0;
  constructor(public nMr: number) { this.mr = new Array(nMr).fill(0); }
  reset() { this.ir = 0; this.tcr = 0; this.tc = 0; this.pr = 0; this.pc = 0; this.mcr = 0; this.mr.fill(0); this.frac = 0; }

  /** Advance by `ticks` PCLK cycles handling matches. */
  advance(pclkTicks: number) {
    if (!(this.tcr & 1) || (this.tcr & 2)) return;
    let ticks = pclkTicks;
    const prescale = (this.pr >>> 0) + 1;
    let guard = 0;
    while (ticks > 0 && guard++ < 100000) {
      // ticks until next TC increment
      const toInc = prescale - this.pc;
      if (ticks < toInc) { this.pc += ticks; return; }
      ticks -= toInc;
      this.pc = 0;
      // number of increments available in remaining ticks (+1 for this one)
      let incs = 1 + Math.floor(ticks / prescale);
      const rem = ticks % prescale;
      // distance to nearest match
      let dist = Infinity;
      for (let i = 0; i < this.nMr; i++) {
        const bits = (this.mcr >> (i * 3)) & 7;
        if (!bits) continue;
        const d = (this.mr[i] >>> 0) - (this.tc >>> 0);
        if (d > 0 && d < dist) dist = d;
      }
      if (dist === Infinity || incs < dist) {
        this.tc = (this.tc + incs) >>> 0;
        this.pc = rem;
        return;
      }
      // advance exactly to the match
      this.tc = (this.tc + dist) >>> 0;
      ticks = (incs - dist) * prescale + rem;
      let doReset = false, doStop = false;
      for (let i = 0; i < this.nMr; i++) {
        if ((this.mr[i] >>> 0) !== this.tc) continue;
        const bits = (this.mcr >> (i * 3)) & 7;
        if (bits & 1) this.ir |= 1 << i;
        if (bits & 2) doReset = true;
        if (bits & 4) doStop = true;
      }
      if (doReset) this.tc = 0;
      if (doStop) { this.tcr &= ~1; return; }
      if (doReset && dist === 0) return;
    }
  }

  /** PCLK ticks until the next interrupting match (approximate), or Infinity. */
  ticksToNextIrq(): number {
    if (!(this.tcr & 1) || (this.tcr & 2)) return Infinity;
    const prescale = (this.pr >>> 0) + 1;
    let best = Infinity;
    for (let i = 0; i < this.nMr; i++) {
      const bits = (this.mcr >> (i * 3)) & 7;
      if (!(bits & 1)) continue;
      const d = (this.mr[i] >>> 0) - (this.tc >>> 0);
      if (d > 0) best = Math.min(best, d * prescale - this.pc);
      else if (d === 0) best = Math.min(best, prescale);
    }
    return best;
  }
}

class Uart {
  dll = 1; dlm = 0; lcr = 0; ier = 0; fcr = 0; scr = 0; fdr = 0x10; ter = 0x80; mcr = 0;
  rx: number[] = [];
  rxLine: number[] = [];   // characters still travelling down the wire
  rxNextAt = 0;
  txBusyUntil = 0;        // shift register finishes sending
  thrEmptyAt = 0;         // holding register hands its byte to the shift register
  threPending = false;
  threArmAt = -1;
  out = '';
  totalTx = 0;
  reset() { this.dll = 1; this.dlm = 0; this.lcr = 0; this.ier = 0; this.fcr = 0; this.rx = []; this.rxLine = []; this.rxNextAt = 0; this.txBusyUntil = 0; this.thrEmptyAt = 0; this.threPending = false; this.threArmAt = -1; }
}

export interface Hint { id: string; msg: string; level: 'info' | 'warn' }

export interface BoardSnapshot {
  t: number;
  leds: number[];       // LD2..LD9 brightness 0..1
  ld10: number;
  seg: number[][];      // [digit 0..3 left->right][segment a..dp] brightness
  lcd: { rows: number[][]; on: boolean; cursor: { r: number; c: number } | null; powered: boolean; version: number; cgram: Uint8Array };
  relay: boolean;
  relayLed: number;
  buzzer: { active: boolean; freq: number; duty: number; mode: 'off' | 'dc' | 'tone' };
  stepper: { angle: number; coils: number[]; steps: number; dir: number; powered: boolean };
  dc: { speed: number; dir: number; duty: number; on: boolean; angle: number };
  dacVolts: number;
  pwm: { enabled: boolean; freq: number; duties: number[] };
  hints: Hint[];
  connected: Partial<Record<Socket, boolean>>;
  irqCount: number;
}

export class Board implements Bus {
  vm: VM | null = null;
  // time
  opsRate = 2_000_000;
  baseOps = 0;
  baseNs = 0;

  ports: Port[] = Array.from({ length: 5 }, () => ({ dir: 0, mask: 0, latch: 0 }));
  pinsel = new Uint32Array(11);
  pinmode = new Uint32Array(10);
  pinmodeOd = new Uint32Array(5);
  gpioFn = [0xffffffff, 0xffffffff, 0xffffffff, 0xffffffff, 0xffffffff]; // bits configured as GPIO
  sc = { pconp: 0x042887de, extint: 0, extmode: 0, extpolar: 0, pclksel0: 0, pclksel1: 0, scs: 0, clksrcsel: 0, cclkcfg: 3, pll0con: 0, pll0cfg: 0, flashcfg: 0, regs: new Map<number, number>() };
  timers = [new TimerCore(4), new TimerCore(4), new TimerCore(4), new TimerCore(4)];
  pwm = new TimerCore(7);
  pwmPcr = 0; pwmLer = 0; pwmShadow = new Array(7).fill(0); pwmStartNs = 0;
  uarts = [new Uart(), new Uart(), new Uart(), new Uart()];
  adc = { cr: 0, inten: 0x100, results: new Array(8).fill(0), done: 0, overrun: 0, gdr: 0, convEndNs: -1, convCh: -1, burstStartNs: 0, trm: 0 };
  potVolts = [1.65, 1.65];   // [AD0.4, AD0.5]
  adcNoise = true;
  dac = { r: 0, ctrl: 0, cntval: 0 };
  systick = { ctrl: 0, load: 0, startNs: 0, wrapsSeen: 0, pending: false, countflagRead: 0 };
  gpioint = { enR0: 0, enF0: 0, enR2: 0, enF2: 0, statR0: 0, statF0: 0, statR2: 0, statF2: 0 };
  nvicEnabled = new Set<number>();
  nvicSwPending = new Set<number>();
  irqCount = 0;

  wiring: Wiring = emptyWiring();
  keys = new Set<number>();      // pressed keys r*4+c
  sw2 = false;
  lcd = new HD44780();

  hints = new Map<string, Hint>();
  stdout = '';
  onUartTx: (uart: number, ch: number) => void = () => {};
  onStdout: (s: string) => void = () => {};

  // device tracking
  private lastOut = [0, 0, 0, 0, 0];   // effective driven-high pins per port
  private lastDrv = [0, 0, 0, 0, 0];   // driven mask per port
  private integT = 0;                  // ns of last integration
  private frameT = 0;
  accLed = new Float64Array(9);
  accSeg = Array.from({ length: 4 }, () => new Float64Array(8));
  accBuzzer = 0; accDcEn = 0; accRelay = 0;
  buzzerEdges = 0; buzzerFirstEdge = -1; buzzerLastEdge = -1;
  stepperPos = 0;   // half steps
  stepperLastPhase = -1;
  stepperSteps = 0;
  stepperDir = 0;
  stepperFirst = false;
  dcSpeed = 0;      // -1..1 filtered
  dcAngle = 0;
  private lastInputs = [0, 0, 0];
  lcdLastEn = false;

  // trace buffers for the oscilloscope
  traceN = 1 << 16;
  traceT = new Float64Array(this.traceN);
  traceV0 = new Uint32Array(this.traceN);
  traceV1 = new Uint32Array(this.traceN);
  traceV2 = new Uint32Array(this.traceN);
  traceHead = 0;
  traceCount = 0;
  dacN = 1 << 15;
  dacT = new Float64Array(this.dacN);
  dacV = new Float32Array(this.dacN);
  dacHead = 0;
  dacCount = 0;

  // wiring derived
  private sockPin: Partial<Record<Socket, (PinRef | null)[]>> = {};

  constructor() { this.rewire(this.wiring); }

  // ---------------- time ----------------
  ns(): number {
    const ops = this.vm ? this.vm.ops : 0;
    return this.baseNs + (ops - this.baseOps) * (1e9 / this.opsRate);
  }
  setRate(r: number) {
    this.baseNs = this.ns();
    this.baseOps = this.vm ? this.vm.ops : 0;
    this.opsRate = r;
  }
  pclk(periph: 'tim0' | 'tim1' | 'tim2' | 'tim3' | 'uart0' | 'uart1' | 'uart2' | 'uart3' | 'pwm' | 'adc'): number {
    let v: number;
    switch (periph) {
      case 'tim0': v = this.sc.pclksel0 >> 2; break;
      case 'tim1': v = this.sc.pclksel0 >> 4; break;
      case 'uart0': v = this.sc.pclksel0 >> 6; break;
      case 'uart1': v = this.sc.pclksel0 >> 8; break;
      case 'pwm': v = this.sc.pclksel0 >> 12; break;
      case 'adc': v = this.sc.pclksel0 >> 24; break;
      case 'tim2': v = this.sc.pclksel1 >> 12; break;
      case 'tim3': v = this.sc.pclksel1 >> 14; break;
      case 'uart2': v = this.sc.pclksel1 >> 16; break;
      default: v = this.sc.pclksel1 >> 18; break;
    }
    return CCLK / PCLK_DIV[v & 3];
  }

  // ---------------- wiring ----------------
  rewire(w: Wiring) {
    this.wiring = { cables: { ...w.cables }, jumpers: { ...w.jumpers } };
    const socks: Socket[] = ['CNA1', 'CNA2', 'CNA5', 'CNB1', 'CNB2', 'CNB3', 'CNAD'];
    this.sockPin = {};
    for (const s of socks) {
      const lines: (PinRef | null)[] = [];
      let any = false;
      for (let i = 0; i < 8; i++) { const p = socketLine(this.wiring, s, i); lines.push(p); if (p) any = true; }
      if (any) this.sockPin[s] = lines;
    }
    this.integrate(this.ns());
    this.devicesUpdate(this.ns(), true);
  }

  connected(s: Socket) { return !!this.sockPin[s]; }

  // ---------------- reset ----------------
  reset() {
    for (const p of this.ports) { p.dir = 0; p.mask = 0; p.latch = 0; }
    this.pinsel.fill(0); this.pinmode.fill(0); this.pinmodeOd.fill(0);
    this.gpioFn = [0xffffffff, 0xffffffff, 0xffffffff, 0xffffffff, 0xffffffff];
    this.sc = { pconp: 0x042887de, extint: 0, extmode: 0, extpolar: 0, pclksel0: 0, pclksel1: 0, scs: 0, clksrcsel: 0, cclkcfg: 3, pll0con: 0, pll0cfg: 0, flashcfg: 0, regs: new Map() };
    this.timers.forEach(t => t.reset());
    this.pwm.reset(); this.pwmPcr = 0; this.pwmLer = 0; this.pwmShadow.fill(0);
    this.uarts.forEach(u => { u.reset(); u.out = ''; });
    this.adc = { cr: 0, inten: 0x100, results: new Array(8).fill(0), done: 0, overrun: 0, gdr: 0, convEndNs: -1, convCh: -1, burstStartNs: 0, trm: 0 };
    this.dac = { r: 0, ctrl: 0, cntval: 0 };
    this.systick = { ctrl: 0, load: 0, startNs: 0, wrapsSeen: 0, pending: false, countflagRead: 0 };
    this.gpioint = { enR0: 0, enF0: 0, enR2: 0, enF2: 0, statR0: 0, statF0: 0, statR2: 0, statF2: 0 };
    this.nvicEnabled.clear(); this.nvicSwPending.clear();
    this.irqCount = 0;
    this.lcd.reset();
    this.lcdLastEn = false;
    this.hints.clear();
    this.stdout = '';
    this.baseNs = 0; this.baseOps = 0;
    this.lastSyncNs = 0;
    this.lastOut = [0, 0, 0, 0, 0]; this.lastDrv = [0, 0, 0, 0, 0];
    this.integT = 0; this.frameT = 0;
    this.accLed.fill(0); this.accSeg.forEach(a => a.fill(0));
    this.accBuzzer = 0; this.accDcEn = 0; this.accRelay = 0;
    this.buzzerEdges = 0; this.buzzerFirstEdge = -1; this.buzzerLastEdge = -1;
    this.stepperPos = 0; this.stepperLastPhase = -1; this.stepperSteps = 0; this.stepperDir = 0; this.stepperFirst = false;
    this.dcSpeed = 0; this.dcAngle = 0;
    this.traceHead = 0; this.traceCount = 0; this.dacHead = 0; this.dacCount = 0;
    this.lastInputs = [this.inputLevels(0), this.inputLevels(1), this.inputLevels(2)];
  }

  hint(id: string, msg: string, level: 'info' | 'warn' = 'warn') {
    if (!this.hints.has(id)) this.hints.set(id, { id, msg, level });
  }

  // ---------------- pins ----------------
  private recomputeFn() {
    // a pin is GPIO when its 2-bit PINSEL field is 00
    for (let port = 0; port < 5; port++) {
      let m = 0;
      for (let half = 0; half < 2; half++) {
        const idx = port * 2 + half;
        if (idx > 10) { m |= 0xffff << (half * 16); continue; }
        const v = this.pinsel[idx];
        for (let i = 0; i < 16; i++) if (((v >> (i * 2)) & 3) === 0) m |= 1 << (half * 16 + i);
      }
      this.gpioFn[port] = m >>> 0;
    }
  }

  /** Mask of pins actively driven as GPIO outputs. */
  drivenMask(port: number) { return (this.ports[port].dir & this.gpioFn[port]) >>> 0; }

  /** Level an input pin sees from the outside world (pull-ups, switches, keypad, analog). */
  inputLevels(port: number): number {
    // default: internal pull-up unless PINMODE selects pull-down
    let v = 0xffffffff;
    for (let half = 0; half < 2; half++) {
      const idx = port * 2 + half;
      if (idx > 9) continue;
      const pm = this.pinmode[idx];
      for (let i = 0; i < 16; i++) if (((pm >> (i * 2)) & 3) === 3) v &= ~(1 << (half * 16 + i));
    }
    // peripheral sockets
    const b1 = this.sockPin.CNB1;
    if (b1 && b1[6] && b1[6].port === port) {
      const bit = b1[6].bit;
      if (this.sw2) v &= ~(1 << bit); else v |= 1 << bit;
    }
    const kp = this.sockPin.CNB3;
    if (kp) {
      for (let line = 0; line < 8; line++) {
        const p = kp[line];
        if (!p || p.port !== port) continue;
        const isCol = line < 4;
        let level = 0; // external pull-down on the key matrix lines
        for (const k of this.keys) {
          const r = k >> 2, c = k & 3;
          if (isCol ? c !== line : r !== line - 4) continue;
          const other = kp[isCol ? 4 + r : c];
          if (!other) continue;
          if (this.drivenMask(other.port) & (1 << other.bit)) {
            if (this.ports[other.port].latch & (1 << other.bit)) level = 1;
          }
        }
        if (level) v |= 1 << p.bit; else v &= ~(1 << p.bit);
      }
    }
    if (port === 1) {
      // analog inputs read as logic
      if (this.potVolts[0] < 1.65) v &= ~(1 << 30);
      if (this.potVolts[1] < 1.65) v &= ~(1 << 31);
    }
    return v >>> 0;
  }

  pinValue(port: number): number {
    const d = this.drivenMask(port);
    return ((this.ports[port].latch & d) | (this.inputLevels(port) & ~d)) >>> 0;
  }

  // ---------------- device integration ----------------
  private pinHigh(p: PinRef | null | undefined): boolean {
    if (!p) return false;
    return ((this.lastOut[p.port] >>> p.bit) & 1) === 1;
  }

  /** Accumulate on-time of output devices up to time t, using the previous output state. */
  integrate(t: number) {
    const dt = t - this.integT;
    if (dt <= 0) { this.integT = Math.max(this.integT, t); return; }
    const s = this.sockPin;
    if (s.CNA1) for (let i = 0; i < 8; i++) if (this.pinHigh(s.CNA1[i])) this.accLed[i] += dt;
    if (s.CNB1 && this.pinHigh(s.CNB1[0])) this.accLed[8] += dt;
    if (s.CNA2 && s.CNB2) {
      const sel = (this.pinHigh(s.CNB2[0]) ? 1 : 0) | (this.pinHigh(s.CNB2[1]) ? 2 : 0) | (this.pinHigh(s.CNB2[2]) ? 4 : 0) | (this.pinHigh(s.CNB2[3]) ? 8 : 0);
      if (sel < 4) {
        const digit = 3 - sel; // select 0 is the rightmost digit
        const acc = this.accSeg[digit];
        for (let i = 0; i < 8; i++) if (this.pinHigh(s.CNA2[i])) acc[i] += dt;
      }
    }
    if (s.CNA5) {
      if (this.pinHigh(s.CNA5[7])) this.accBuzzer += dt;
      if (this.pinHigh(s.CNA5[5])) this.accDcEn += dt;
      if (this.pinHigh(s.CNA5[4])) this.accRelay += dt;
    }
    this.integT = t;
  }

  /** Called after any change of GPIO outputs. */
  outputsChanged() {
    const t = this.ns();
    let changed = false;
    for (let p = 0; p < 3; p++) {
      const d = this.drivenMask(p);
      const o = (this.ports[p].latch & d) >>> 0;
      if (o !== this.lastOut[p] || d !== this.lastDrv[p]) { changed = true; }
    }
    if (!changed) return;
    this.integrate(t);
    const prev0 = this.lastOut[0];
    for (let p = 0; p < 5; p++) {
      const d = this.drivenMask(p);
      this.lastDrv[p] = d;
      this.lastOut[p] = (this.ports[p].latch & d) >>> 0;
    }
    // trace
    const h = this.traceHead;
    this.traceT[h] = t;
    this.traceV0[h] = this.lastOut[0];
    this.traceV1[h] = this.lastOut[1];
    this.traceV2[h] = this.lastOut[2];
    this.traceHead = (h + 1) & (this.traceN - 1);
    if (this.traceCount < this.traceN) this.traceCount++;
    this.devicesUpdate(t, false, prev0);
    this.checkInputs();
  }

  private devicesUpdate(t: number, force: boolean, prev0 = this.lastOut[0]) {
    const s = this.sockPin;
    // LCD: latch on falling edge of EN
    if (s.CNAD && this.wiring.jumpers.JP16) {
      const en = this.pinHigh(s.CNAD[5]);
      if (this.lcdLastEn && !en && !force) {
        let nib = 0;
        for (let i = 0; i < 4; i++) if (this.pinHigh(s.CNAD[i])) nib |= 1 << i;
        this.lcd.strobe(this.pinHigh(s.CNAD[4]), nib);
      }
      this.lcdLastEn = en;
    }
    if (s.CNA5) {
      // buzzer edges
      const bz = s.CNA5[7];
      if (bz && bz.port === 0) {
        const was = (prev0 >>> bz.bit) & 1, now = this.pinHigh(bz) ? 1 : 0;
        if (was !== now) {
          this.buzzerEdges++;
          if (this.buzzerFirstEdge < 0) this.buzzerFirstEdge = t;
          this.buzzerLastEdge = t;
        }
      }
      // stepper phase decoding
      let bits = 0;
      for (let i = 0; i < 4; i++) if (this.pinHigh(s.CNA5[i])) bits |= 1 << i;
      // The ULN2803 driver inverts: a LOW at the MCU energises the coil.
      const anyDriven = s.CNA5.slice(0, 4).some(p => p && (this.lastDrv[p.port] >>> p.bit) & 1);
      if (anyDriven) {
        const coils = (~bits) & 0xf;
        const phase = phaseOf(coils);
        if (phase >= 0) {
          if (this.stepperLastPhase < 0) {
            // first energisation: the rotor snaps to this coil
            this.stepperFirst = true;
          } else if (phase !== this.stepperLastPhase) {
            let d = (phase - this.stepperLastPhase + 8) % 8;
            if (d > 4) d -= 8;
            if (d === 4) d = 0;
            if (d !== 0 && this.stepperFirst) {
              // assume the rotor was one step behind before the first pulse
              this.stepperPos += d; this.stepperSteps++;
              this.stepperFirst = false;
            }
            this.stepperPos += d;
            if (d !== 0) { this.stepperSteps++; this.stepperDir = Math.sign(d); }
          }
          this.stepperLastPhase = phase;
        }
      }
    }
  }

  /** Watch input pins for edges (external interrupts and GPIO interrupts). */
  checkInputs() {
    for (const port of [0, 2]) {
      const now = this.pinValue(port);
      const prev = this.lastInputs[port];
      if (now === prev) continue;
      this.lastInputs[port] = now;
      const rise = (now & ~prev) >>> 0, fall = (prev & ~now) >>> 0;
      if (port === 0) { this.gpioint.statR0 |= rise & this.gpioint.enR0; this.gpioint.statF0 |= fall & this.gpioint.enF0; }
      else {
        this.gpioint.statR2 |= rise & this.gpioint.enR2; this.gpioint.statF2 |= fall & this.gpioint.enF2;
        // EINT0..3 on P2.10..13
        for (let n = 0; n < 4; n++) {
          const bit = 10 + n;
          if (((this.pinsel[4] >> (bit * 2)) & 3) !== 1) continue;
          const edge = (this.sc.extmode >> n) & 1;
          const pol = (this.sc.extpolar >> n) & 1;
          const r = (rise >> bit) & 1, f = (fall >> bit) & 1;
          if (edge && ((pol && r) || (!pol && f))) this.sc.extint |= 1 << n;
        }
      }
    }
    this.flagIrq();
  }

  /** Level-sensitive EINT state. */
  private eintLevelActive(n: number): boolean {
    const bit = 10 + n;
    if (((this.pinsel[4] >> (bit * 2)) & 3) !== 1) return false;
    if ((this.sc.extmode >> n) & 1) return false;
    const level = (this.pinValue(2) >> bit) & 1;
    const pol = (this.sc.extpolar >> n) & 1;
    return pol ? level === 1 : level === 0;
  }

  // ---------------- user inputs ----------------
  pressKey(k: number, down: boolean) {
    if (down) this.keys.add(k); else this.keys.delete(k);
    this.checkInputs();
  }
  setSw2(down: boolean) { this.sw2 = down; this.checkInputs(); }
  /** A character typed in the terminal: it reaches the RX FIFO one character-time later, like a real serial line. */
  uartReceive(u: number, ch: number) {
    const ua = this.uarts[u];
    const now = this.ns();
    if (!ua.rxLine.length) ua.rxNextAt = Math.max(ua.rxNextAt, now) + this.uartCharNs(u);
    ua.rxLine.push(ch & 0xff);
    this.flagIrq();
  }

  // ---------------- interrupts ----------------
  flagIrq() { if (this.vm) this.vm.irqCheck = true; }

  irqAsserted(irq: number): boolean {
    if (this.nvicSwPending.has(irq)) return true;
    if (irq >= 1 && irq <= 4) return (this.timers[irq - 1].ir & 0x3f) !== 0;
    if (irq >= 5 && irq <= 8) return this.uartIntId(irq - 5) !== 1;
    if (irq === 9) return (this.pwm.ir & 0x7ff) !== 0;
    if (irq >= 18 && irq <= 21) {
      const n = irq - 18;
      if ((this.sc.extint >> n) & 1) return true;
      if (this.eintLevelActive(n)) { this.sc.extint |= 1 << n; return true; }
      if (irq === 21) return (this.gpioint.statR0 | this.gpioint.statF0 | this.gpioint.statR2 | this.gpioint.statF2) !== 0;
      return false;
    }
    if (irq === 22) {
      const done = this.adc.done;
      return (this.adc.inten & 0xff & done) !== 0 || ((this.adc.inten & 0x100) !== 0 && (this.adc.gdr >>> 31) === 1 && (this.adc.inten & 0xff) === 0 && false);
    }
    return false;
  }

  /** Returns the irq to service, -1000 if none. */
  pendingIrq = (): number => {
    this.sync();
    if (this.systick.pending && (this.systick.ctrl & 2)) return -1;
    for (const irq of [...this.nvicEnabled].sort((a, b) => a - b)) {
      if (this.irqAsserted(irq)) return irq;
    }
    return -1000;
  };

  onIrqEnter = (irq: number) => {
    this.irqCount++;
    if (irq === -1) this.systick.pending = false;
    this.nvicSwPending.delete(irq);
  };

  nvicEnable(irq: number) {
    if (irq < 0) return;
    this.nvicEnabled.add(irq);
    if (!this.vm?.irqHandlers.has(irq)) {
      const names: Record<number, string> = { 1: 'TIMER0_IRQHandler', 2: 'TIMER1_IRQHandler', 3: 'TIMER2_IRQHandler', 4: 'TIMER3_IRQHandler', 5: 'UART0_IRQHandler', 6: 'UART1_IRQHandler', 7: 'UART2_IRQHandler', 8: 'UART3_IRQHandler', 9: 'PWM1_IRQHandler', 18: 'EINT0_IRQHandler', 19: 'EINT1_IRQHandler', 20: 'EINT2_IRQHandler', 21: 'EINT3_IRQHandler', 22: 'ADC_IRQHandler' };
      this.hint('nohandler' + irq, `Interrupt ${irq} is enabled but ${names[irq] ?? 'its handler'}() is not defined — the interrupt will be ignored.`);
    }
    this.flagIrq();
  }
  nvicDisable(irq: number) { this.nvicEnabled.delete(irq); }
  nvicSetPending(irq: number) { this.nvicSwPending.add(irq); this.flagIrq(); }
  nvicClearPending(irq: number) { this.nvicSwPending.delete(irq); }
  sysTickConfig(ticks: number): number {
    if (ticks - 1 > 0xffffff) return 1;
    this.systick.load = (ticks - 1) & 0xffffff;
    this.systick.ctrl = 7;
    this.systick.startNs = this.ns();
    this.systick.wrapsSeen = 0;
    return 0;
  }

  // ---------------- peripheral time sync ----------------
  private lastSyncNs = 0;
  sync() {
    const t = this.ns();
    const dt = t - this.lastSyncNs;
    if (dt <= 0) return;
    this.lastSyncNs = t;
    // timers
    const names = ['tim0', 'tim1', 'tim2', 'tim3'] as const;
    for (let i = 0; i < 4; i++) {
      const tm = this.timers[i];
      if (!(tm.tcr & 1)) continue;
      const f = this.pclk(names[i]);
      const exact = dt * f / 1e9 + tm.frac;
      const ticks = Math.floor(exact);
      tm.frac = exact - ticks;
      const before = tm.ir;
      tm.advance(ticks);
      if (tm.ir !== before) this.flagIrq();
    }
    if (this.pwm.tcr & 1) {
      const f = this.pclk('pwm');
      const exact = dt * f / 1e9 + this.pwm.frac;
      const ticks = Math.floor(exact);
      this.pwm.frac = exact - ticks;
      const before = this.pwm.ir;
      this.pwm.advance(ticks);
      if (this.pwm.ir !== before) this.flagIrq();
    }
    // systick
    if (this.systick.ctrl & 1) {
      const period = ((this.systick.load & 0xffffff) + 1) / CCLK * 1e9;
      const wraps = Math.floor((t - this.systick.startNs) / period);
      if (wraps > this.systick.wrapsSeen) {
        this.systick.wrapsSeen = wraps;
        if (this.systick.ctrl & 2) { this.systick.pending = true; this.flagIrq(); }
      }
    }
    // uart tx completion
    for (let u = 0; u < 4; u++) {
      const ua = this.uarts[u];
      if (ua.threArmAt >= 0 && t >= ua.threArmAt) {
        ua.threArmAt = -1;
        if (ua.ier & 2) { ua.threPending = true; this.flagIrq(); }
      }
      while (ua.rxLine.length && t >= ua.rxNextAt) {
        const ch = ua.rxLine.shift()!;
        if (ua.rx.length < 16) ua.rx.push(ch); // a full FIFO overruns, as on the real UART
        if (ua.rxLine.length) ua.rxNextAt += this.uartCharNs(u);
      }
      if (ua.rx.length && (ua.ier & 1)) this.flagIrq();
    }
    // adc
    if (this.adc.convEndNs >= 0 && t >= this.adc.convEndNs) {
      this.finishConversion(this.adc.convCh);
      this.adc.convEndNs = -1;
    }
    if ((this.adc.cr & (1 << 16)) && (this.adc.cr & (1 << 21))) this.burstUpdate(t);
  }

  /** ns until the next timed event that could raise an interrupt. */
  nextEventNs(): number {
    const t = this.ns();
    let best = Infinity;
    const names = ['tim0', 'tim1', 'tim2', 'tim3'] as const;
    for (let i = 0; i < 4; i++) {
      if (!this.nvicEnabled.has(1 + i)) continue; // polled timers need no slicing
      const ticks = this.timers[i].ticksToNextIrq();
      if (ticks !== Infinity) best = Math.min(best, ticks / this.pclk(names[i]) * 1e9);
    }
    if (this.pwm.mcr && this.nvicEnabled.has(9)) {
      const ticks = this.pwm.ticksToNextIrq();
      if (ticks !== Infinity) best = Math.min(best, ticks / this.pclk('pwm') * 1e9);
    }
    if ((this.systick.ctrl & 3) === 3) {
      const period = ((this.systick.load & 0xffffff) + 1) / CCLK * 1e9;
      const next = this.systick.startNs + (this.systick.wrapsSeen + 1) * period;
      best = Math.min(best, Math.max(0, next - t));
    }
    this.uarts.forEach((ua, u) => {
      if (ua.threArmAt >= 0 && this.nvicEnabled.has(5 + u)) best = Math.min(best, Math.max(0, ua.threArmAt - t));
      if (ua.rxLine.length) best = Math.min(best, Math.max(0, ua.rxNextAt - t));
    });
    if (this.adc.convEndNs >= 0 && this.nvicEnabled.has(22)) best = Math.min(best, Math.max(0, this.adc.convEndNs - t));
    return best;
  }

  // ---------------- ADC ----------------
  private adcSample(ch: number): number {
    let v = 0;
    if (ch === 4) v = this.wiring.jumpers.JP18 ? this.potVolts[0] : 0;
    else if (ch === 5) v = this.potVolts[1];
    else v = 0;
    let code = Math.round(v / 3.3 * 4095);
    if (this.adcNoise) code += Math.round((Math.random() - 0.5) * 3);
    return Math.max(0, Math.min(4095, code));
  }
  private finishConversion(ch: number) {
    if (ch < 0) return;
    const code = this.adcSample(ch);
    if ((this.adc.done >> ch) & 1) this.adc.overrun |= 1 << ch;
    this.adc.results[ch] = code;
    this.adc.done |= 1 << ch;
    this.adc.gdr = ((1 << 31) | (ch << 24) | (code << 4)) >>> 0;
    this.flagIrq();
  }
  private burstUpdate(t: number) {
    const sel = this.adc.cr & 0xff;
    if (!sel) return;
    const conv = 65 / Math.min(13e6, this.pclk('adc') / (((this.adc.cr >> 8) & 0xff) + 1)) * 1e9;
    const chans: number[] = [];
    for (let i = 0; i < 8; i++) if ((sel >> i) & 1) chans.push(i);
    const n = Math.floor((t - this.adc.burstStartNs) / conv);
    if (n <= 0) return;
    // results of the most recent conversions
    const k = Math.min(n, chans.length);
    for (let j = 0; j < k; j++) this.finishConversion(chans[(n - 1 - j) % chans.length]);
    this.adc.burstStartNs += n * conv;
  }

  // ---------------- UART ----------------
  private uartIntId(u: number): number {
    const ua = this.uarts[u];
    if ((ua.ier & 1) && ua.rx.length) return 0x04;
    if ((ua.ier & 2) && ua.threPending) return 0x02;
    return 0x01;
  }
  private uartCharNs(u: number): number {
    const ua = this.uarts[u];
    const div = Math.max(1, ua.dlm * 256 + ua.dll);
    const baud = this.pclk((['uart0', 'uart1', 'uart2', 'uart3'] as const)[u]) / (16 * div);
    return 10 / baud * 1e9;
  }

  // ---------------- bus ----------------
  read(addr: number, size: number): number {
    this.sync();
    if (addr >= 0x40004000 && addr < 0x40008080) {
      const i = addr < 0x40008000 ? 0 : 1;
      return this.timerRead(this.timers[i], addr - TIMER_BASES[i]);
    }
    // GPIO
    if (addr >= GPIO_BASE && addr < GPIO_BASE + 0xa0) {
      const port = (addr - GPIO_BASE) >> 5;
      const off = (addr - GPIO_BASE) & 0x1f;
      const reg = off & ~3;
      const shift = (off & 3) * 8;
      const P = this.ports[port];
      let v = 0;
      switch (reg) {
        case 0x00: v = P.dir; break;
        case 0x10: v = P.mask; break;
        case 0x14: v = (this.pinValue(port) & ~P.mask) >>> 0; break;
        case 0x18: v = P.latch; break;
        case 0x1c: v = 0; break;
      }
      return sized(v >>> shift, size);
    }
    if (addr >= PINCON && addr < PINCON + 0x80) {
      const off = addr - PINCON;
      if (off < 0x2c) return this.pinsel[off >> 2];
      if (off >= 0x40 && off < 0x68) return this.pinmode[(off - 0x40) >> 2];
      if (off >= 0x68 && off < 0x7c) return this.pinmodeOd[(off - 0x68) >> 2];
      return 0;
    }
    if (addr >= SC && addr < SC + 0x200) {
      switch (addr - SC) {
        case 0x0c4: return this.sc.pconp;
        case 0x140: return this.sc.extint;
        case 0x148: return this.sc.extmode;
        case 0x14c: return this.sc.extpolar;
        case 0x1a8: return this.sc.pclksel0;
        case 0x1ac: return this.sc.pclksel1;
        case 0x088: return 0x03000000 | 0x0b; // PLL0 locked & connected
        case 0x1a0: return this.sc.scs | 0x40;
        default: return this.sc.regs.get(addr - SC) ?? 0;
      }
    }
    if (addr >= ADC && addr < ADC + 0x40) {
      const off = addr - ADC;
      if (off === 0x00) return this.adc.cr;
      if (off === 0x04) {
        const v = this.adc.gdr;
        this.adc.gdr = (this.adc.gdr & 0x7fffffff) >>> 0; // reading clears DONE
        const ch = (v >> 24) & 7;
        if (v >>> 31) this.adc.done &= ~(1 << ch);
        return v >>> 0;
      }
      if (off === 0x0c) return this.adc.inten;
      if (off >= 0x10 && off < 0x30) {
        const ch = (off - 0x10) >> 2;
        const d = (this.adc.done >> ch) & 1, ov = (this.adc.overrun >> ch) & 1;
        this.adc.done &= ~(1 << ch); this.adc.overrun &= ~(1 << ch);
        if (((this.adc.gdr >> 24) & 7) === ch) this.adc.gdr = (this.adc.gdr & 0x7fffffff) >>> 0;
        return ((d << 31) | (ov << 30) | (this.adc.results[ch] << 4)) >>> 0;
      }
      if (off === 0x30) return (this.adc.done | (this.adc.overrun << 8) | (this.adc.done ? 1 << 16 : 0)) >>> 0;
      return 0;
    }
    if (addr >= DAC && addr < DAC + 0x10) {
      const off = addr - DAC;
      if (off === 0) return this.dac.r; if (off === 4) return this.dac.ctrl; if (off === 8) return this.dac.cntval;
      return 0;
    }
    for (let i = 0; i < 4; i++) {
      const base = TIMER_BASES[i];
      if (addr >= base && addr < base + 0x80) return this.timerRead(this.timers[i], addr - base);
    }
    for (let u = 0; u < 4; u++) {
      const base = UART_BASES[u];
      if (addr >= base && addr < base + 0x40) return sized(this.uartRead(u, addr - base), size);
    }
    if (addr >= PWM1 && addr < PWM1 + 0x80) {
      const off = addr - PWM1;
      if (off === 0x4c) return this.pwmPcr;
      if (off === 0x50) return this.pwmLer;
      return this.timerRead(this.pwm, off);
    }
    if (addr >= GPIOINT && addr < GPIOINT + 0x40) {
      const g = this.gpioint;
      switch (addr - GPIOINT) {
        case 0x00: return ((g.statR0 | g.statF0) ? 1 : 0) | ((g.statR2 | g.statF2) ? 4 : 0);
        case 0x04: return g.statR0; case 0x08: return g.statF0;
        case 0x10: return g.enR0; case 0x14: return g.enF0;
        case 0x24: return g.statR2; case 0x28: return g.statF2;
        case 0x30: return g.enR2; case 0x34: return g.enF2;
      }
      return 0;
    }
    if (addr >= SYSTICK && addr < SYSTICK + 0x10) {
      const st = this.systick;
      switch (addr - SYSTICK) {
        case 0: {
          let v = st.ctrl;
          if (st.wrapsSeen > st.countflagRead) { v |= 1 << 16; st.countflagRead = st.wrapsSeen; }
          return v;
        }
        case 4: return st.load;
        case 8: {
          if (!(st.ctrl & 1)) return 0;
          const cycles = Math.floor((this.ns() - st.startNs) * CCLK / 1e9);
          const per = (st.load & 0xffffff) + 1;
          return st.load - (cycles % per);
        }
        case 12: return 0x80000000 | 99999;
      }
    }
    if (addr >= 0x400b0000 && addr < 0x400b0010) return 0;
    this.hint('badread' + addr.toString(16), `Read from unmodelled address 0x${addr.toString(16).toUpperCase()} returned 0.`, 'info');
    return 0;
  }

  write(addr: number, size: number, value: number): void {
    this.sync();
    if (addr >= GPIO_BASE && addr < GPIO_BASE + 0xa0) {
      const port = (addr - GPIO_BASE) >> 5;
      const off = (addr - GPIO_BASE) & 0x1f;
      const reg = off & ~3;
      const shift = (off & 3) * 8;
      const fieldMask = (size === 4 ? 0xffffffff : size === 2 ? 0xffff : 0xff) << shift;
      const v = (value << shift) & fieldMask;
      const P = this.ports[port];
      switch (reg) {
        case 0x00: P.dir = ((P.dir & ~fieldMask) | v) >>> 0; break;
        case 0x10: P.mask = ((P.mask & ~fieldMask) | v) >>> 0; break;
        case 0x14: { const m = fieldMask & ~P.mask; P.latch = ((P.latch & ~m) | (v & m)) >>> 0; break; }
        case 0x18: P.latch = (P.latch | (v & ~P.mask)) >>> 0; break;
        case 0x1c: P.latch = (P.latch & ~(v & ~P.mask)) >>> 0; break;
        default: return;
      }
      this.outputsChanged();
      return;
    }
    if (addr >= PINCON && addr < PINCON + 0x80) {
      const off = addr - PINCON;
      if (off < 0x2c) { this.pinsel[off >> 2] = value >>> 0; this.recomputeFn(); this.outputsChanged(); this.pinselHints(); }
      else if (off >= 0x40 && off < 0x68) { this.pinmode[(off - 0x40) >> 2] = value >>> 0; this.checkInputs(); }
      else if (off >= 0x68 && off < 0x7c) this.pinmodeOd[(off - 0x68) >> 2] = value >>> 0;
      return;
    }
    if (addr >= SC && addr < SC + 0x200) {
      switch (addr - SC) {
        case 0x0c4: this.sc.pconp = value >>> 0; return;
        case 0x140: {
          // writing 1 clears; level-sensitive inputs stay set while active
          this.sc.extint &= ~value;
          for (let n = 0; n < 4; n++) if (((value >> n) & 1) && this.eintLevelActive(n)) this.sc.extint |= 1 << n;
          this.flagIrq();
          return;
        }
        case 0x148: this.sc.extmode = value & 0xf; return;
        case 0x14c: this.sc.extpolar = value & 0xf; return;
        case 0x1a8: this.sc.pclksel0 = value >>> 0; return;
        case 0x1ac: this.sc.pclksel1 = value >>> 0; return;
        default: this.sc.regs.set(addr - SC, value >>> 0); return;
      }
    }
    if (addr >= ADC && addr < ADC + 0x40) {
      const off = addr - ADC;
      if (!((this.sc.pconp >> 12) & 1)) {
        this.hint('adcpower', 'The ADC is written to but not powered — set bit 12 of LPC_SC->PCONP first.');
        return;
      }
      if (off === 0x00) {
        const prevBurst = (this.adc.cr >> 16) & 1;
        this.adc.cr = value >>> 0;
        if (!((value >> 21) & 1)) { this.hint('adcpdn', 'ADC conversion requested with PDN (bit 21 of ADCR) = 0, so the ADC stays powered down.'); return; }
        const sel = value & 0xff;
        if (!sel) return;
        if ((value >> 16) & 1) { if (!prevBurst) this.adc.burstStartNs = this.ns(); return; }
        const start = (value >> 24) & 7;
        if (start === 1) {
          let ch = 0; while (!((sel >> ch) & 1)) ch++;
          const clk = Math.min(13e6, this.pclk('adc') / (((value >> 8) & 0xff) + 1));
          this.adc.convCh = ch;
          this.adc.convEndNs = this.ns() + 65 / clk * 1e9;
          const pinOk = ch === 4 ? ((this.pinsel[3] >> 28) & 3) === 3 : ch === 5 ? ((this.pinsel[3] >> 30) & 3) === 3 : true;
          if (!pinOk) this.hint('adcpin' + ch, `AD0.${ch} is being converted but its pin is not set to the ADC function in PINSEL3.`, 'info');
        }
      } else if (off === 0x0c) this.adc.inten = value & 0x1ff;
      return;
    }
    if (addr >= DAC && addr < DAC + 0x10) {
      const off = addr - DAC;
      if (off === 0) {
        this.dac.r = value >>> 0;
        const pinOk = ((this.pinsel[1] >> 20) & 3) === 2;
        if (!pinOk) this.hint('dacpin', 'DACR written, but P0.26 is not configured as AOUT (PINSEL1 bits 21:20 = 10).');
        if (this.wiring.jumpers.JP5) this.hint('dacjp5', 'JP5 is closed: P0.26 also drives LCD D7. Open JP5 to observe a clean DAC output at TP8.', 'info');
        const h = this.dacHead;
        this.dacT[h] = this.ns();
        this.dacV[h] = pinOk ? ((value >> 6) & 0x3ff) / 1024 * 3.3 : 0;
        this.dacHead = (h + 1) & (this.dacN - 1);
        if (this.dacCount < this.dacN) this.dacCount++;
      } else if (off === 4) this.dac.ctrl = value >>> 0;
      else if (off === 8) this.dac.cntval = value & 0xffff;
      return;
    }
    for (let u = 0; u < 4; u++) {
      const base = UART_BASES[u];
      if (addr >= base && addr < base + 0x40) { this.uartWrite(u, addr - base, value); return; }
    }
    for (let i = 0; i < 4; i++) {
      const base = TIMER_BASES[i];
      if (addr >= base && addr < base + 0x80) { this.timerWrite(this.timers[i], addr - base, value); return; }
    }
    if (addr >= PWM1 && addr < PWM1 + 0x80) {
      const off = addr - PWM1;
      if (off === 0x4c) { this.pwmPcr = value >>> 0; this.outputsChanged(); return; }
      if (off === 0x50) {
        this.pwmLer = value & 0x7f;
        for (let i = 0; i < 7; i++) if ((value >> i) & 1) this.pwm.mr[i] = this.pwmShadow[i];
        return;
      }
      const mrIdx = off >= 0x18 && off <= 0x24 ? (off - 0x18) >> 2 : off >= 0x40 && off <= 0x48 ? 4 + ((off - 0x40) >> 2) : -1;
      if (mrIdx >= 0) {
        this.pwmShadow[mrIdx] = value >>> 0;
        if (!(this.pwm.tcr & 1) || !(this.pwm.tcr & 8)) this.pwm.mr[mrIdx] = value >>> 0;
        return;
      }
      if (off === 0x04 && (value & 1) && !(this.pwm.tcr & 1)) this.pwmStartNs = this.ns();
      this.timerWrite(this.pwm, off, value);
      return;
    }
    if (addr >= GPIOINT && addr < GPIOINT + 0x40) {
      const g = this.gpioint;
      switch (addr - GPIOINT) {
        case 0x0c: g.statR0 &= ~value; g.statF0 &= ~value; break;
        case 0x10: g.enR0 = value >>> 0; break;
        case 0x14: g.enF0 = value >>> 0; break;
        case 0x2c: g.statR2 &= ~value; g.statF2 &= ~value; break;
        case 0x30: g.enR2 = value >>> 0; break;
        case 0x34: g.enF2 = value >>> 0; break;
      }
      this.flagIrq();
      return;
    }
    if (addr >= SYSTICK && addr < SYSTICK + 0x10) {
      const st = this.systick;
      switch (addr - SYSTICK) {
        case 0: {
          const wasOn = st.ctrl & 1;
          st.ctrl = value & 7;
          if (!wasOn && (value & 1)) { st.startNs = this.ns(); st.wrapsSeen = 0; st.countflagRead = 0; }
          break;
        }
        case 4: st.load = value & 0xffffff; break;
        case 8: st.startNs = this.ns(); st.wrapsSeen = 0; st.countflagRead = 0; break;
      }
      this.flagIrq();
      return;
    }
    if (addr >= 0xe000e100 && addr < 0xe000e400) {
      // direct NVIC register access (ISER/ICER)
      const off = addr - 0xe000e100;
      const base = (off & 0x7f) >> 2;
      if (off < 0x80) { for (let i = 0; i < 32; i++) if ((value >>> i) & 1) this.nvicEnable(base * 32 + i); }
      else if (off < 0x100) { for (let i = 0; i < 32; i++) if ((value >>> i) & 1) this.nvicDisable(base * 32 + i); }
      return;
    }
    this.hint('badwrite' + addr.toString(16), `Write to unmodelled address 0x${addr.toString(16).toUpperCase()} was ignored.`, 'info');
  }

  private pinselHints() {
    // nothing fatal — reserved for future checks
  }

  private uartRead(u: number, off: number): number {
    const ua = this.uarts[u];
    const dlab = (ua.lcr & 0x80) !== 0;
    switch (off) {
      case 0x00: if (dlab) return ua.dll; { const c = ua.rx.shift(); this.flagIrq(); return c ?? 0; }
      case 0x04: return dlab ? ua.dlm : ua.ier;
      case 0x08: {
        const id = this.uartIntId(u);
        if (id === 0x02) ua.threPending = false;
        return id | ((ua.fcr & 1) ? 0xc0 : 0);
      }
      case 0x0c: return ua.lcr;
      case 0x10: return ua.mcr;
      case 0x14: {
        const now = this.ns();
        return (ua.rx.length ? 1 : 0) | (now >= ua.thrEmptyAt ? 0x20 : 0) | (now >= ua.txBusyUntil ? 0x40 : 0);
      }
      case 0x1c: return ua.scr;
      case 0x28: return ua.fdr;
      case 0x30: return ua.ter;
    }
    return 0;
  }

  private uartWrite(u: number, off: number, v: number) {
    const ua = this.uarts[u];
    const dlab = (ua.lcr & 0x80) !== 0;
    switch (off) {
      case 0x00:
        if (dlab) { ua.dll = v & 0xff; return; }
        {
          const ch = v & 0xff;
          ua.out += String.fromCharCode(ch);
          if (ua.out.length > 20000) ua.out = ua.out.slice(-16000);
          ua.totalTx++;
          ua.threPending = false;
          const now = this.ns();
          // THR -> shift register as soon as the shifter is free; THRE follows one bit later
          const start = Math.max(now, ua.txBusyUntil);
          ua.txBusyUntil = start + this.uartCharNs(u);
          ua.thrEmptyAt = start + this.uartCharNs(u) / 10;
          ua.threArmAt = ua.thrEmptyAt;
          this.onUartTx(u, ch);
          if (!((this.sc.pconp >> [3, 4, 24, 25][u]) & 1)) this.hint('uartpower' + u, `UART${u} is used but not powered — set bit ${[3, 4, 24, 25][u]} of LPC_SC->PCONP.`);
        }
        return;
      case 0x04:
        if (dlab) { ua.dlm = v & 0xff; return; }
        {
          const was = ua.ier;
          ua.ier = v & 0x37f;
          if (!(was & 2) && (v & 2) && this.ns() >= ua.thrEmptyAt) ua.threArmAt = this.ns() + this.uartCharNs(u);
          this.flagIrq();
        }
        return;
      case 0x08: ua.fcr = v & 0xff; if (v & 2) ua.rx = []; return;
      case 0x0c: ua.lcr = v & 0xff; return;
      case 0x10: ua.mcr = v & 0xff; return;
      case 0x1c: ua.scr = v & 0xff; return;
      case 0x28: ua.fdr = v & 0xff; return;
      case 0x30: ua.ter = v & 0xff; return;
    }
  }

  private timerRead(t: TimerCore, off: number): number {
    switch (off) {
      case 0x00: return t.ir;
      case 0x04: return t.tcr;
      case 0x08: return t.tc;
      case 0x0c: return t.pr;
      case 0x10: return t.pc;
      case 0x14: return t.mcr;
      case 0x18: case 0x1c: case 0x20: case 0x24: return t.mr[(off - 0x18) >> 2];
      case 0x40: case 0x44: case 0x48: return t.mr[4 + ((off - 0x40) >> 2)] ?? 0;
      case 0x3c: return t.emr;
      case 0x70: return t.ctcr;
      case 0x28: return t.ccr;
    }
    return 0;
  }

  private timerWrite(t: TimerCore, off: number, v: number) {
    switch (off) {
      case 0x00: t.ir &= ~v; break;
      case 0x04: t.tcr = v & 0xf; if (v & 2) { t.tc = 0; t.pc = 0; } break;
      case 0x08: t.tc = v >>> 0; break;
      case 0x0c: t.pr = v >>> 0; break;
      case 0x10: t.pc = v >>> 0; break;
      case 0x14: t.mcr = v & 0x1fffff; break;
      case 0x18: case 0x1c: case 0x20: case 0x24: t.mr[(off - 0x18) >> 2] = v >>> 0; break;
      case 0x3c: t.emr = v >>> 0; break;
      case 0x70: t.ctcr = v >>> 0; break;
      case 0x28: t.ccr = v >>> 0; break;
    }
    this.flagIrq();
  }

  // ---------------- PWM output ----------------
  pwmChannels(): { enabled: boolean; freq: number; duties: number[] } {
    const on = (this.pwm.tcr & 1) && (this.pwm.tcr & 8);
    const period = (this.pwm.mr[0] >>> 0) + 1;
    const f = this.pclk('pwm') / ((this.pwm.pr >>> 0) + 1) / period;
    const duties = [0, 0, 0, 0, 0, 0];
    for (let ch = 1; ch <= 6; ch++) {
      if (!((this.pwmPcr >> (8 + ch)) & 1)) { duties[ch - 1] = -1; continue; }
      const m = this.pwm.mr[ch] >>> 0;
      duties[ch - 1] = Math.max(0, Math.min(1, m / period));
    }
    return { enabled: !!on, freq: on ? f : 0, duties };
  }

  /** Which PWM channel (1..6) drives a pin, or 0. */
  pwmOnPin(port: number, bit: number): number {
    if (port === 1) {
      const map: Record<number, [number, number]> = { 18: [1, 4], 20: [2, 8], 21: [3, 10], 23: [4, 14], 24: [5, 16], 26: [6, 20] };
      const m = map[bit];
      if (m && ((this.pinsel[3] >> m[1]) & 3) === 2) return m[0];
    }
    if (port === 2 && bit <= 5) {
      if (((this.pinsel[4] >> (bit * 2)) & 3) === 1) return bit + 1;
    }
    return 0;
  }

  /** Level of a pin at time t for scope traces (handles PWM analytically). */
  pinLevelAt(port: number, bit: number, t: number, traceLevel: number): number {
    const ch = this.pwmOnPin(port, bit);
    if (ch) {
      const pc = this.pwmChannels();
      if (!pc.enabled || pc.duties[ch - 1] < 0) return 0;
      const period = 1e9 / pc.freq;
      const phase = ((t - this.pwmStartNs) % period + period) % period;
      return phase < pc.duties[ch - 1] * period ? 1 : 0;
    }
    return traceLevel;
  }

  // ---------------- per-frame snapshot ----------------
  snapshot(wallDt: number): BoardSnapshot {
    const t = this.ns();
    this.integrate(t);
    const span = t - this.frameT;
    const s = this.sockPin;
    const frac = (acc: number, p: PinRef | null | undefined) => span > 1000 ? Math.min(1, acc / span) : (this.pinHigh(p) ? 1 : 0);
    const leds: number[] = [];
    for (let i = 0; i < 8; i++) leds.push(s.CNA1 ? frac(this.accLed[i], s.CNA1[i]) : 0);
    let ld10 = s.CNB1 ? frac(this.accLed[8], s.CNB1[0]) : 0;
    // LD10 sits on P1.23 which may be a PWM output
    if (s.CNB1 && s.CNB1[0]) {
      const p = s.CNB1[0];
      const ch = this.pwmOnPin(p.port, p.bit);
      if (ch) { const pc = this.pwmChannels(); ld10 = pc.enabled && pc.duties[ch - 1] >= 0 ? pc.duties[ch - 1] : 0; }
    }
    const seg: number[][] = [];
    for (let d = 0; d < 4; d++) {
      const row: number[] = [];
      for (let i = 0; i < 8; i++) {
        let v = 0;
        if (s.CNA2 && s.CNB2) {
          if (span > 1000) v = Math.min(1, this.accSeg[d][i] / span * 1.0);
          else {
            const sel = (this.pinHigh(s.CNB2[0]) ? 1 : 0) | (this.pinHigh(s.CNB2[1]) ? 2 : 0) | (this.pinHigh(s.CNB2[2]) ? 4 : 0) | (this.pinHigh(s.CNB2[3]) ? 8 : 0);
            v = sel < 4 && 3 - sel === d && this.pinHigh(s.CNA2[i]) ? 1 : 0;
          }
        }
        row.push(v);
      }
      seg.push(row);
    }
    // buzzer
    let buzzer: BoardSnapshot['buzzer'] = { active: false, freq: 0, duty: 0, mode: 'off' };
    if (s.CNA5) {
      const duty = frac(this.accBuzzer, s.CNA5[7]);
      const edges = this.buzzerEdges;
      if (edges >= 4 && this.buzzerLastEdge > this.buzzerFirstEdge) {
        const f = (edges - 1) / 2 / ((this.buzzerLastEdge - this.buzzerFirstEdge) / 1e9);
        if (f > 30) buzzer = { active: true, freq: f, duty, mode: 'tone' };
        else buzzer = { active: duty > 0.5, freq: 0, duty, mode: duty > 0.02 ? 'dc' : 'off' };
      } else buzzer = { active: duty > 0.02, freq: 0, duty, mode: duty > 0.02 ? 'dc' : 'off' };
    }
    // stepper
    const coils = [0, 0, 0, 0];
    if (s.CNA5) for (let i = 0; i < 4; i++) {
      const p = s.CNA5[i];
      if (p && ((this.lastDrv[p.port] >>> p.bit) & 1)) coils[i] = this.pinHigh(p) ? 0 : 1;
    }
    // DC motor: P0.9 enables, P0.10 selects direction
    let dcDuty = 0, dcDir = 0;
    if (s.CNA5) {
      dcDuty = frac(this.accDcEn, s.CNA5[5]);
      dcDir = this.pinHigh(s.CNA5[6]) ? 1 : -1;
    }
    const sim = Math.max(0, span) / 1e9;
    const tau = 0.35;
    const target = dcDuty * dcDir;
    if (sim > 0) this.dcSpeed += (target - this.dcSpeed) * (1 - Math.exp(-sim / tau));
    this.dcAngle = (this.dcAngle + this.dcSpeed * 720 * sim) % 360;
    const relayOn = s.CNA5 ? frac(this.accRelay, s.CNA5[4]) > 0.5 : false;

    const pc = this.pwmChannels();
    const snap: BoardSnapshot = {
      t,
      leds, ld10, seg,
      lcd: { rows: [this.lcd.row(0), this.lcd.row(1)], on: this.lcd.displayOn, cursor: this.lcd.cursorPos(), powered: !!s.CNAD && this.wiring.jumpers.JP16, version: this.lcd.version, cgram: this.lcd.cgram },
      relay: relayOn,
      relayLed: relayOn ? 1 : 0,
      buzzer,
      stepper: { angle: this.stepperPos * 0.9, coils, steps: this.stepperSteps, dir: this.stepperDir, powered: !!s.CNA5 },
      dc: { speed: this.dcSpeed, dir: dcDir, duty: dcDuty, on: dcDuty > 0.01, angle: this.dcAngle },
      dacVolts: ((this.dac.r >> 6) & 0x3ff) / 1024 * 3.3,
      pwm: pc,
      hints: [...this.hints.values()],
      connected: Object.fromEntries((Object.keys(this.sockPin) as Socket[]).map(k => [k, true])),
      irqCount: this.irqCount,
    };
    // reset frame accumulators
    this.accLed.fill(0); this.accSeg.forEach(a => a.fill(0));
    this.accBuzzer = 0; this.accDcEn = 0; this.accRelay = 0;
    if (span > 1000) { this.buzzerEdges = 0; this.buzzerFirstEdge = -1; this.buzzerLastEdge = -1; }
    this.frameT = t;
    void wallDt;
    return snap;
  }
}

function sized(v: number, size: number) {
  return size === 4 ? v >>> 0 : size === 2 ? v & 0xffff : v & 0xff;
}

/** Map an energised-coil pattern to a half-step phase 0..7, or -1. */
function phaseOf(coils: number): number {
  switch (coils) {
    case 0b0001: return 0;
    case 0b0011: return 1;
    case 0b0010: return 2;
    case 0b0110: return 3;
    case 0b0100: return 4;
    case 0b1100: return 5;
    case 0b1000: return 6;
    case 0b1001: return 7;
  }
  return -1;
}
