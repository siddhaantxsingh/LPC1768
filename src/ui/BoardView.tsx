import { useState } from 'react';
import type { BoardSnapshot } from '../sim/board/machine';
import { Header, JUMPERS, Jumper, SOCKETS, Socket, Wiring } from '../sim/board/wiring';
import type { Device } from '../content/experiments';
import { Buzzer, DcMotor, Keypad, Knob, Lcd, Led, Relay, SevenSeg, Stepper, Tact } from './parts';
import { IFocus, IInfo, IPlug, IWarn } from './icons';

interface Props {
  snap: BoardSnapshot | null;
  wiring: Wiring;
  recommended?: Wiring;
  devices?: Device[];
  pressed: Set<number>;
  sw2: boolean;
  pots: number[];
  onWiring: (w: Wiring) => void;
  onKey: (k: number, down: boolean) => void;
  onSw2: (d: boolean) => void;
  onPot: (i: number, v: number) => void;
}

const SOCKET_ORDER: Socket[] = ['CNA1', 'CNA2', 'CNA5', 'CNB1', 'CNB2', 'CNB3', 'CNAD'];

export function sameWiring(a: Wiring, b: Wiring) {
  const ka = Object.entries(a.cables).filter(([, v]) => v).sort().join();
  const kb = Object.entries(b.cables).filter(([, v]) => v).sort().join();
  return ka === kb && a.jumpers.JP5 === b.jumpers.JP5 && a.jumpers.JP16 === b.jumpers.JP16 && a.jumpers.JP18 === b.jumpers.JP18;
}

export function BoardView(p: Props) {
  const [focus, setFocus] = useState(true);
  const s = p.snap;
  const devs = new Set(p.devices ?? []);
  const has = (...d: Device[]) => d.some(x => devs.has(x));
  const conn = (sock: Socket) => Object.values(p.wiring.cables).includes(sock);
  const needed = new Set(Object.values(p.recommended?.cables ?? {}));

  const toggleSocket = (sock: Socket) => {
    const cables = { ...p.wiring.cables };
    const cur = (Object.entries(cables) as [Header, Socket][]).find(([, v]) => v === sock);
    if (cur) delete cables[cur[0]];
    else {
      // prefer the header the program asks for, else the socket's home header
      const rec = (Object.entries(p.recommended?.cables ?? {}) as [Header, Socket][]).find(([, v]) => v === sock);
      const h: Header = rec ? rec[0] : SOCKETS[sock].home;
      cables[h] = sock;
    }
    p.onWiring({ ...p.wiring, cables });
  };
  const toggleJumper = (j: Jumper) => p.onWiring({ ...p.wiring, jumpers: { ...p.wiring.jumpers, [j]: !p.wiring.jumpers[j] } });
  const headerOf = (sock: Socket) => (Object.entries(p.wiring.cables) as [Header, Socket][]).find(([, v]) => v === sock)?.[0];
  const mod = (cls: string, used: boolean, wired: boolean | null) => `mod ${cls}${used ? ' used' : ' dim'}${wired === false ? ' unwired' : ''}`;
  const silk = (title: string, sock?: Socket, extra?: string) => (
    <div className="silk"><span>{title}</span>{sock ? <span className={'sock' + (conn(sock) ? '' : ' off')} title={conn(sock) ? '' : 'Socket not connected'}>{conn(sock) ? `${headerOf(sock)}→${sock}` : `${sock} · open`}</span> : extra ? <span className="sock">{extra}</span> : null}</div>
  );
  const matches = !p.recommended || sameWiring(p.wiring, p.recommended);
  const pc = s?.pwm;

  return (
    <>
      <div className="wiring" aria-label="Ribbon cables and jumpers">
        <div className="wiring-row">
          <span className="lbl">Cables</span>
          {SOCKET_ORDER.map(sock => {
            const h = headerOf(sock);
            return (
              <button key={sock} className={'chip' + (h ? ' on' : '') + (needed.has(sock) ? ' need' : '')} onClick={() => toggleSocket(sock)} title={`${SOCKETS[sock].title}${h ? ` — fed from ${h}. Click to unplug.` : ' — click to plug in'}`}>
                {h ? <><span className="from">{h}</span><span className="arrow" /></> : null}{sock}
              </button>
            );
          })}
        </div>
        <div className="wiring-row">
          <span className="lbl">Jumpers</span>
          {(Object.keys(JUMPERS) as Jumper[]).map(j => (
            <button key={j} className={'chip jp' + (p.wiring.jumpers[j] ? ' on' : '')} onClick={() => toggleJumper(j)} title={`${JUMPERS[j].desc} Currently ${p.wiring.jumpers[j] ? 'closed' : 'open'}.`}>
              <span className="pin" />{JUMPERS[j].title}
            </button>
          ))}
          <span style={{ flex: 1 }} />
          {p.recommended && !matches && (
            <button className="btn sm" onClick={() => p.onWiring(p.recommended!)} title="Set cables and jumpers as the manual says"><IPlug />Wire as in manual</button>
          )}
          <button className={'btn sm ghost icon'} aria-pressed={focus} onClick={() => setFocus(f => !f)} title={focus ? 'Showing the parts this program uses — click to show everything equally' : 'Highlight the parts this program uses'}><IFocus /></button>
        </div>
      </div>

      <div className={'pcb' + (focus && devs.size ? ' focus' : '')}>
        <div className={mod('m-lcd', has('lcd'), conn('CNAD'))}>
          {silk('16×2 LCD', 'CNAD')}
          <div className="lcd-bezel">
            {s ? <Lcd rows={s.lcd.rows} on={s.lcd.on} powered={s.lcd.powered} cursor={s.lcd.cursor} version={s.lcd.version} cgram={s.lcd.cgram} /> : <Lcd rows={[[], []]} on={false} powered={false} cursor={null} version={0} cgram={new Uint8Array(64)} />}
          </div>
        </div>
        <div className={mod('m-seg', has('seg'), conn('CNA2') && conn('CNB2'))}>
          {silk('7-segment', undefined, conn('CNA2') && conn('CNB2') ? 'CNA2 · CNB2' : `${conn('CNA2') ? '' : 'CNA2 '}${conn('CNB2') ? '' : 'CNB2'}`.trim() + ' ✕')}
          <div className="seg-wrap"><SevenSeg seg={s?.seg ?? [[0, 0, 0, 0, 0, 0, 0, 0], [0, 0, 0, 0, 0, 0, 0, 0], [0, 0, 0, 0, 0, 0, 0, 0], [0, 0, 0, 0, 0, 0, 0, 0]]} /></div>
        </div>

        <div className={mod('m-leds', has('leds', 'ld10'), conn('CNA1') || conn('CNB1') ? null : false)}>
          {silk('LEDs', 'CNA1')}
          <div className="leds">
            {Array.from({ length: 8 }, (_, i) => <Led key={i} b={s?.leds[i] ?? 0} label={`LD${i + 2}`} pin={`P0.${i + 4}`} />)}
            <span />
            <Led b={s?.ld10 ?? 0} label="LD10" pin="P1.23" green />
          </div>
        </div>
        <div className={mod('m-sw', has('sw2', 'buzzer', 'relay'), null)}>
          {silk('SW2 · buzzer · relay', undefined)}
          <div className="sw-row">
            <div className="sw-item">
              <Tact down={p.sw2} onChange={p.onSw2} label="SW2, external interrupt 2 (P2.12)" />
              <span className="cap">SW2 {conn('CNB1') ? '' : '✕'}</span>
            </div>
            <div className="sw-item">
              <Buzzer on={!!s && s.buzzer.mode !== 'off' && (s.buzzer.mode === 'tone' || s.buzzer.duty > 0.05)} />
              <span className="cap">{s?.buzzer.mode === 'tone' ? `${Math.round(s.buzzer.freq)} Hz` : 'Buzzer'}</span>
            </div>
            <div className="sw-item">
              <Relay on={!!s?.relay} />
              <span className="cap">Relay {s?.relay ? 'on' : ''}</span>
            </div>
          </div>
        </div>

        <div className={mod('m-key', has('keypad'), conn('CNB3'))}>
          {silk('4×4 keys', 'CNB3')}
          <Keypad pressed={p.pressed} onKey={p.onKey} />
        </div>
        <div className={mod('m-step', has('stepper'), conn('CNA5'))}>
          {silk('Stepper', 'CNA5')}
          <div className="motor">
            <Stepper angle={s?.stepper.angle ?? 0} coils={s?.stepper.coils ?? [0, 0, 0, 0]} steps={s?.stepper.steps ?? 0} />
            <div className="readout"><b>{((s?.stepper.angle ?? 0)).toFixed(1)}°</b><span>{s?.stepper.steps ?? 0} steps</span></div>
          </div>
        </div>
        <div className={mod('m-dc', has('dc'), conn('CNA5'))}>
          {silk('DC motor', 'CNA5')}
          <div className="motor">
            <DcMotor angle={s?.dc.angle ?? 0} speed={s?.dc.speed ?? 0} />
            <div className="readout"><b>{Math.round(Math.abs(s?.dc.speed ?? 0) * 1500)} rpm</b><span>{(s?.dc.speed ?? 0) > 0.02 ? 'CW' : (s?.dc.speed ?? 0) < -0.02 ? 'CCW' : 'stopped'}</span></div>
          </div>
        </div>

        <div className={mod('m-pot', has('adc'), null)}>
          {silk('Analog inputs', undefined, p.wiring.jumpers.JP18 ? 'JP18 2-3' : 'JP18 open')}
          <div className="pots">
            {[0, 1].map(i => (
              <div className="knob-wrap" key={i}>
                <Knob value={p.pots[i]} onChange={v => p.onPot(i, v)} label={i === 0 ? 'POT4 on AD0.4 (P1.30)' : 'POT on AD0.5 (P1.31)'} />
                <div className="knob-val"><small>{i === 0 ? 'POT4 · AD0.4' : 'AD0.5'}</small>{p.pots[i].toFixed(2)} V<br /><span style={{ opacity: .6 }}>0x{Math.round(p.pots[i] / 3.3 * 4095).toString(16).toUpperCase().padStart(3, '0')}</span></div>
              </div>
            ))}
          </div>
        </div>
        <div className={mod('m-out', has('dac', 'scope'), null)}>
          {silk('Test points', undefined)}
          <div className="meter">
            <div className="cell"><small>TP8 · DAC</small><b className={s && s.dacVolts > 0 ? '' : 'off'}>{(s?.dacVolts ?? 0).toFixed(3)} V</b></div>
            <div className="cell"><small>TP5 · PWM1.4</small><b className={pc?.enabled && pc.duties[3] >= 0 ? '' : 'off'}>{pc?.enabled && pc.duties[3] >= 0 ? `${fmtHz(pc.freq)} · ${(pc.duties[3] * 100).toFixed(0)}%` : '—'}</b></div>
          </div>
        </div>
      </div>

      {s && s.hints.length > 0 && (
        <div className="hints">
          {s.hints.slice(0, 4).map(h => (
            <div key={h.id} className={'hint' + (h.level === 'info' ? ' info' : '')}>{h.level === 'info' ? <IInfo /> : <IWarn />}<span>{h.msg}</span></div>
          ))}
        </div>
      )}
    </>
  );
}

export function fmtHz(f: number) {
  if (f >= 1e6) return (f / 1e6).toFixed(2) + ' MHz';
  if (f >= 1e3) return (f / 1e3).toFixed(f >= 1e4 ? 1 : 2) + ' kHz';
  return f.toFixed(f < 10 ? 2 : 0) + ' Hz';
}
