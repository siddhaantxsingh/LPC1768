import { useEffect, useState } from 'react';
import { EXPERIMENTS } from '../content/experiments';
import { href } from '../bench/router';
import { Board, BoardSnapshot } from '../sim/board/machine';
import { compile, Session } from '../sim/runner';
import { Lcd, Led, SevenSeg } from './parts';
import { IArrow } from './icons';

const DEMO = `#include <LPC17xx.h>
unsigned int d;
const unsigned char digits[4] = {0x4F, 0x66, 0x06, 0x4F};   /* 3 4 1 3, rightmost first */

void pulse(unsigned int v, int rs)
{
    LPC_GPIO0->FIOCLR = 0x1F800000;
    LPC_GPIO0->FIOSET = ((v & 0xF) << 23) | (rs ? 1 << 27 : 0);
    LPC_GPIO0->FIOSET = 1 << 28;
    for (d = 0; d < 40; d++);
    LPC_GPIO0->FIOCLR = 1 << 28;
}
void lcd(unsigned char b, int rs) { pulse(b >> 4, rs); pulse(b, rs); }
void text(unsigned char at, char *s) { lcd(at, 0); while (*s) lcd(*s++, 1); }

int main(void)
{
    unsigned int t = 0, led = 0, k;
    LPC_GPIO0->FIODIR = 0x1FFF8FF0;
    LPC_GPIO1->FIODIR = 0x07800000;
    pulse(3, 0); pulse(3, 0); pulse(3, 0); pulse(2, 0);
    lcd(0x28, 0); lcd(0x0C, 0); lcd(0x06, 0); lcd(0x01, 0);
    text(0x80, "  ECE 3143 LAB");
    text(0xC0, " C, in your tab");
    while (1) {
        for (k = 0; k < 4; k++) {
            LPC_GPIO0->FIOCLR = 0xFF0;
            LPC_GPIO0->FIOSET = digits[k] << 4;
            LPC_GPIO1->FIOPIN = k << 23;
            for (d = 0; d < 260; d++);
        }
        if (++t == 28) {
            t = 0;
            LPC_GPIO0->FIOCLR = 0x7F8000;
            LPC_GPIO0->FIOSET = 1 << (15 + (led < 8 ? led : 14 - led));
            led = (led + 1) % 14;
        }
    }
}
`;

function useDemo(): BoardSnapshot | null {
  const [snap, setSnap] = useState<BoardSnapshot | null>(null);
  useEffect(() => {
    const r = compile({ 'main.c': DEMO });
    if (!r.ok || !r.out) { console.warn(r.diagnostics); return; }
    const board = new Board();
    board.rewire({ cables: { CNA: 'CNA2', CNB: 'CNB2', CNC: 'CNA1', CND: 'CNAD' }, jumpers: { JP5: true, JP16: true, JP18: true, JP7: false, JP8: false } });
    const s = new Session(r.out, board);
    board.setRate(3_000_000);
    let raf = 0, last = performance.now(), frame = 0;
    const tick = (now: number) => {
      raf = requestAnimationFrame(tick);
      const dt = Math.min(0.05, (now - last) / 1000);
      last = now;
      s.advance(dt * 1e9, now + 6);
      if ((frame++ & 1) === 0) setSnap(board.snapshot(dt));
    };
    raf = requestAnimationFrame(tick);
    const vis = () => { if (document.hidden) cancelAnimationFrame(raf); else { last = performance.now(); raf = requestAnimationFrame(tick); } };
    document.addEventListener('visibilitychange', vis);
    return () => { cancelAnimationFrame(raf); document.removeEventListener('visibilitychange', vis); };
  }, []);
  return snap;
}

export function Home() {
  const snap = useDemo();
  const asm = EXPERIMENTS.filter(e => e.lang === 'asm');
  const c = EXPERIMENTS.filter(e => e.lang === 'c');
  const nProg = EXPERIMENTS.reduce((a, e) => a + e.programs.length, 0);
  const nEx = EXPERIMENTS.reduce((a, e) => a + e.exercises.length, 0);
  return (
    <main className="home">
      <div className="home-inner">
        <section className="hero">
          <div>
            <div className="eyebrow">ECE 3143 · Microcontrollers &amp; Embedded Systems lab</div>
            <h1>The whole lab manual, <em>running</em> in your browser.</h1>
            <p className="lede">
              All ten experiments — ARM7 assembly and LPC1768 embedded C — with every program from the manual and a worked solution to every exercise.
              Edit the code, wire the trainer, and watch the LEDs, LCD, motors and buzzer respond. Nothing to install.
            </p>
            <div className="cta">
              <a className="btn primary" href={href.exp(5)}>Start with GPIO <IArrow /></a>
              <a className="btn" href={href.exp(1)}>ARM7 assembly</a>
              <a className="btn ghost" href={href.play('c')}>Blank C project</a>
            </div>
          </div>
          <div className="hero-board">
            <div className="pcb" style={{ margin: 0, gridTemplateColumns: 'repeat(6, minmax(0,1fr))' }}>
              <div className="mod used" style={{ gridColumn: 'span 6' }}>
                <div className="silk"><span>16×2 LCD</span><span className="sock">CND→CNAD</span></div>
                <div className="lcd-bezel">
                  <Lcd rows={snap?.lcd.rows ?? [[], []]} on={snap?.lcd.on ?? false} powered={true} cursor={null} version={snap?.lcd.version ?? 0} cgram={snap?.lcd.cgram ?? new Uint8Array(64)} />
                </div>
              </div>
              <div className="mod used" style={{ gridColumn: 'span 3' }}>
                <div className="silk"><span>7-segment</span><span className="sock">CNA2·CNB2</span></div>
                <div className="seg-wrap"><SevenSeg seg={snap?.seg ?? [[0, 0, 0, 0, 0, 0, 0, 0], [0, 0, 0, 0, 0, 0, 0, 0], [0, 0, 0, 0, 0, 0, 0, 0], [0, 0, 0, 0, 0, 0, 0, 0]]} /></div>
              </div>
              <div className="mod used" style={{ gridColumn: 'span 3' }}>
                <div className="silk"><span>LEDs</span><span className="sock">CNC→CNA1</span></div>
                <div className="leds" style={{ gridTemplateColumns: 'repeat(8, 1fr)', paddingTop: 8 }}>
                  {Array.from({ length: 8 }, (_, i) => <Led key={i} b={snap?.leds[i] ?? 0} label={`LD${i + 2}`} />)}
                </div>
              </div>
            </div>
            <div className="hero-caption"><span className="live-dot" />Live: this panel is driven by a C program compiled and executed in this tab.</div>
          </div>
        </section>

        <div className="section-title">
          <h2>Experiments</h2>
          <span>{nProg} programs · {nEx} exercises, all solved</span>
        </div>
        <div className="index">
          <div className="index-part">
            <h3>Part A — ARM7 assembly</h3>
            {asm.map(e => <IndexRow key={e.no} e={e} />)}
          </div>
          <div className="index-part">
            <h3>Part B — LPC1768 embedded C</h3>
            {c.map(e => <IndexRow key={e.no} e={e} />)}
          </div>
        </div>

        <div className="section-title">
          <h2>On the bench</h2>
          <span>What runs behind each experiment</span>
        </div>
        <div className="facts">
          <div className="fact">
            <div className="k">C compiler</div>
            <h4>Your code, compiled in the tab</h4>
            <p>A C compiler for the lab subset — structs, pointers, interrupts, <span className="mono">sprintf</span> — with the real <span className="mono">LPC17xx.h</span> register map. Errors point at the line, in plain language.</p>
          </div>
          <div className="fact">
            <div className="k">ARM7 core</div>
            <h4>Keil-style assembly</h4>
            <p>AREA, ENTRY, EQU, DCD and literal pools; conditional execution, LDM/STM and the barrel shifter. Step through and watch every register and flag.</p>
          </div>
          <div className="fact">
            <div className="k">Trainer board</div>
            <h4>Peripherals that behave</h4>
            <p>HD44780 LCD, multiplexed 7-segment, key matrix, stepper and DC motors, relay, buzzer, ADC, DAC, PWM, timers, UART and external interrupts — wired with FRC cables, like the real kit.</p>
          </div>
        </div>

        <footer className="home-foot">
          <span>An unofficial study companion for the ECE 3143 lab manual. Programs follow the manual; corrections are flagged in each program's notes.</span>
          <span>Press <kbd>?</kbd> for shortcuts</span>
        </footer>
      </div>
    </main>
  );
}

function IndexRow({ e }: { e: (typeof EXPERIMENTS)[number] }) {
  return (
    <a className="row" href={href.exp(e.no)}>
      <span className="n">{String(e.no).padStart(2, '0')}</span>
      <span>
        <div className="t">{e.short}</div>
        <div className="d">{e.programs.length} programs · {e.exercises.length} exercises</div>
      </span>
      <span className="go"><IArrow /></span>
    </a>
  );
}
