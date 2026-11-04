import { useEffect, useLayoutEffect, useRef, useState } from 'react';
import type { BoardSnapshot } from '../sim/board/machine';
import { Header, HEADERS, JUMPERS, Jumper, Requirement, SOCKETS, Socket, Wiring } from '../sim/board/wiring';
import { Lcd, SevenSeg } from './parts';
import { fmtHz } from './BoardView';
import boardArt from '../assets/board.svg';

// Board artwork and coordinates come from the original simulator's board.svg / layout.json
// (1440 × 1040 design units, ALS-SDA-ARMCTXM3-01).
export const BW = 1440;
export const BH = 1040;

type Orient = 'h' | 'v';
const CONN: Record<Header | Socket, { at: [number, number]; o: Orient }> = {
  CNA: { at: [635, 398], o: 'h' }, CNB: { at: [815, 551], o: 'v' }, CNC: { at: [465, 572], o: 'v' }, CND: { at: [635, 754], o: 'h' },
  CNA1: { at: [184, 849], o: 'h' }, CNA2: { at: [897, 274], o: 'h' }, CNB2: { at: [1040, 274], o: 'h' }, CNB3: { at: [975, 777], o: 'h' },
  CNB1: { at: [259, 735], o: 'v' }, CNAD: { at: [780, 145], o: 'v' }, CNA5: { at: [1168, 678], o: 'v' },
};
const HEADER_IDS: Header[] = ['CNA', 'CNB', 'CNC', 'CND'];
const SOCKET_IDS: Socket[] = ['CNA1', 'CNA2', 'CNA5', 'CNB1', 'CNB2', 'CNB3', 'CNAD'];
const JPOS: Record<Jumper, { at: [number, number]; pins: 2 | 3; label: string }> = {
  JP16: { at: [780, 304], pins: 2, label: 'JP16' },
  JP5: { at: [790, 399], pins: 2, label: 'JP5' },
  JP18: { at: [1300, 942], pins: 3, label: 'JP18' },
  JP8: { at: [714, 829], pins: 3, label: 'JP8' },
  JP7: { at: [782, 829], pins: 3, label: 'JP7' },
};
const LED_X = [94, 120, 146, 172, 198, 224, 250, 276]; // LD2 … LD9
const LED_Y = 927;

type Pick = { kind: 'h'; id: Header } | { kind: 's'; id: Socket } | null;

interface Props {
  snap: BoardSnapshot | null;
  wiring: Wiring;
  requirement: Requirement | null;
  showReq: boolean;
  running: boolean;
  pressed: Set<number>;
  sw2: boolean;
  pots: number[];
  onWiring: (w: Wiring) => void;
  onKey: (k: number, down: boolean) => void;
  onSw2: (d: boolean) => void;
  onPot: (i: number, v: number) => void;
  onReset?: () => void;
}

const EMPTY_SEG = [[0, 0, 0, 0, 0, 0, 0, 0], [0, 0, 0, 0, 0, 0, 0, 0], [0, 0, 0, 0, 0, 0, 0, 0], [0, 0, 0, 0, 0, 0, 0, 0]];

export function TrainerBoard(p: Props) {
  const [pick, setPick] = useState<Pick>(null);
  const [hoverCable, setHoverCable] = useState<Header | null>(null);
  const s = p.snap;
  const cables = p.wiring.cables;
  const socketHeader = (sock: Socket) => (Object.entries(cables) as [Header, Socket][]).find(([, v]) => v === sock)?.[0] ?? null;

  useEffect(() => {
    const k = (e: KeyboardEvent) => { if (e.key === 'Escape') setPick(null); };
    window.addEventListener('keydown', k);
    return () => window.removeEventListener('keydown', k);
  }, []);

  const needCable = new Set<string>();
  const needJumper = new Set<Jumper>();
  if (p.requirement && p.showReq) {
    for (const [h, so] of p.requirement.cables) if (cables[h] !== so) { needCable.add(h); needCable.add(so); }
    for (const [j, v] of Object.entries(p.requirement.jumpers) as [Jumper, boolean][]) if (!!p.wiring.jumpers[j] !== v) needJumper.add(j);
  }

  const connect = (h: Header, so: Socket) => {
    const next = { ...cables };
    for (const k of Object.keys(next) as Header[]) if (next[k] === so) delete next[k];
    next[h] = so;
    p.onWiring({ ...p.wiring, cables: next });
    setPick(null);
  };
  const unplug = (h: Header) => {
    const next = { ...cables };
    delete next[h];
    p.onWiring({ ...p.wiring, cables: next });
    setHoverCable(null);
  };
  const clickConn = (id: Header | Socket) => {
    const isHeader = (HEADER_IDS as string[]).includes(id);
    if (isHeader) {
      if (pick?.kind === 's') return connect(id as Header, pick.id);
      setPick(pick?.kind === 'h' && pick.id === id ? null : { kind: 'h', id: id as Header });
    } else {
      if (pick?.kind === 'h') return connect(pick.id, id as Socket);
      setPick(pick?.kind === 's' && pick.id === id ? null : { kind: 's', id: id as Socket });
    }
  };
  const toggleJumper = (j: Jumper) => p.onWiring({ ...p.wiring, jumpers: { ...p.wiring.jumpers, [j]: !p.wiring.jumpers[j] } });

  const pc = s?.pwm;
  const pwmOn = !!(pc?.enabled && pc.duties[3] >= 0);
  const buzz = !!s && (s.buzzer.mode === 'tone' || (s.buzzer.mode === 'dc' && s.buzzer.duty > 0.05));

  return (
    <div className={'trainer2' + (pick ? ' picking picking-' + pick.kind : '')} onPointerDown={e => { if (e.target === e.currentTarget || (e.target as HTMLElement).classList.contains('tb-art')) setPick(null); }}>
      <img className="tb-art" src={boardArt} width={BW} height={BH} alt="" draggable={false} />

      {/* power LED */}
      <span className="t-led green on" style={{ left: 1183 - 6, top: 161 - 6 }} title="+5 V" />
      <span className={'t-led green' + (p.running ? ' on blink' : '')} style={{ left: 1183 - 6, top: 180 - 6 }} title="Running" />
      <span className="t-silk" style={{ left: 1196, top: 174 }}>RUN</span>

      {/* LCD glass and 7-segment window */}
      <div className="t-abs t-lcd" style={{ left: 374, top: 92, width: 304, height: 86 }}>
        <Lcd rows={s?.lcd.rows ?? [[], []]} on={s?.lcd.on ?? false} powered={s?.lcd.powered ?? false} cursor={s?.lcd.cursor ?? null} version={s?.lcd.version ?? 0} cgram={s?.lcd.cgram ?? new Uint8Array(64)} />
      </div>
      <div className="t-abs t-seg" style={{ left: 852, top: 66, width: 248, height: 102 }}><SevenSeg seg={s?.seg ?? EMPTY_SEG} /></div>

      {/* general purpose LEDs LD2–LD9 and LD10 */}
      {LED_X.map((x, i) => <Lamp key={i} x={x} y={LED_Y} b={s?.leds[i] ?? 0} label={`LD${i + 2} · P0.${i + 4}`} />)}
      <Lamp x={225} y={748} b={s?.ld10 ?? 0} label="LD10 · P1.23" green />

      {/* buzzer and relays */}
      <div className={'t-buzz' + (buzz ? ' on' : '')} style={{ left: 1165 - 34, top: 370 - 34 }} title={buzz ? `Buzzer ${s!.buzzer.mode === 'tone' ? Math.round(s!.buzzer.freq) + ' Hz' : 'on'}` : 'Buzzer (P0.11)'}>
        <i /><i /><i />
      </div>
      {buzz && s!.buzzer.mode === 'tone' && <span className="t-tag" style={{ left: 1132, top: 452 }}>{Math.round(s!.buzzer.freq)} Hz</span>}
      <span className={'t-led red' + (s?.relay ? ' on' : '')} style={{ left: 1234 - 6, top: 384 - 6 }} title="Relay K1 (P0.8)" />
      <span className={'t-relay' + (s?.relay ? ' on' : '')} style={{ left: 1356, top: 352 }}>{s?.relay ? 'ON' : 'OFF'}</span>

      {/* motor driver indicators */}
      <span className={'t-led green' + (s && Math.abs(s.dc.speed) > 0.03 ? ' on' : '')} style={{ left: 1376 - 6, top: 520 - 6 }} title="DC motor driver" />
      {[0, 1, 2, 3].map(i => <span key={i} className={'t-led amber' + (s?.stepper.coils[i] ? ' on' : '')} style={{ left: 1218 + i * 22 - 5, top: 660 - 5, width: 10, height: 10 }} title={`Stepper coil ${'ABCD'[i]}`} />)}
      <span className="t-silk" style={{ left: 1214, top: 670 }}>A  B  C  D</span>

      {/* pots AD0.4 / AD0.5 */}
      {[[357, 403], [357, 493]].map(([x, y], i) => <Pot key={i} x={x} y={y} v={p.pots[i]} onChange={v => p.onPot(i, v)} label={i === 0 ? 'POT4 → AD0.4 (P1.30)' : 'AD0.5 (P1.31)'} />)}
      <span className="t-tag" style={{ left: 334, top: 374 }}>{p.pots[0].toFixed(2)} V</span>
      <span className="t-tag" style={{ left: 334, top: 464 }}>{p.pots[1].toFixed(2)} V</span>

      {/* test points */}
      <span className={'t-tag tp' + (s && s.dacVolts > 0 ? '' : ' off')} style={{ left: 410, top: 462 }} title="TP8 · DAC output (P0.26)">TP8 {(s?.dacVolts ?? 0).toFixed(2)} V</span>
      <span className={'t-tag tp' + (pwmOn ? '' : ' off')} style={{ left: 214, top: 790 }} title="TP5 · PWM1.4 (P1.23)">{pwmOn ? `PWM ${(pc!.duties[3] * 100).toFixed(0)}% · ${fmtHz(pc!.freq)}` : 'TP5'}</span>

      {/* push buttons */}
      <TactBtn x={152} y={710} down={p.sw2} onChange={p.onSw2} label="SW2 (EINT2, P2.12)" cap="SW2" />
      {p.onReset && <TactBtn x={350} y={696} down={false} onChange={d => { if (d) p.onReset!(); }} label="SW1 reset" cap="RST" red />}

      {/* 4×4 key matrix */}
      {Array.from({ length: 16 }, (_, k) => {
        const r = k >> 2, c = k & 3;
        return <Key key={k} x={897 + c * 56} y={822 + r * 40} k={k} down={p.pressed.has(k)} onKey={p.onKey} />;
      })}

      {/* cables */}
      <svg className="cables" viewBox={`0 0 ${BW} ${BH}`} width={BW} height={BH}>
        {(Object.entries(cables) as [Header, Socket][]).map(([h, so]) => {
          const [x1, y1] = CONN[h].at;
          const [x2, y2] = CONN[so].at;
          const dx = x2 - x1, dy = y2 - y1, len = Math.hypot(dx, dy) || 1;
          let nx = -dy / len, ny = dx / len;
          if (ny < 0) { nx = -nx; ny = -ny; }
          const bow = 40 + len * 0.18;
          const d = `M${x1} ${y1} Q ${(x1 + x2) / 2 + nx * bow} ${(y1 + y2) / 2 + ny * bow} ${x2} ${y2}`;
          return (
            <g key={h} className={'cable' + (hoverCable === h ? ' hover' : '')} onPointerEnter={() => setHoverCable(h)} onPointerLeave={() => setHoverCable(null)} onClick={() => unplug(h)}>
              <title>{`${h} → ${so}: click to unplug`}</title>
              <path d={d} className="cable-hit" />
              <path d={d} className="cable-body" />
              <path d={d} className="cable-ridges" />
              <path d={d} className="cable-stripe" />
            </g>
          );
        })}
      </svg>

      {/* FRC headers and sockets */}
      {[...HEADER_IDS, ...SOCKET_IDS].map(id => {
        const isH = (HEADER_IDS as string[]).includes(id);
        const connected = isH ? !!cables[id as Header] : !!socketHeader(id as Socket);
        return (
          <Conn key={id} id={id} {...CONN[id]} kind={isH ? 'h' : 's'} connected={connected}
            selected={!!pick && pick.id === id} need={needCable.has(id)} target={!!pick && pick.kind !== (isH ? 'h' : 's')}
            sub={isH ? HEADERS[id as Header].desc : SOCKETS[id as Socket].title} onClick={() => clickConn(id)} />
        );
      })}
      {(Object.keys(JPOS) as Jumper[]).map(j => <JumperPart key={j} id={j} {...JPOS[j]} on={!!p.wiring.jumpers[j]} need={needJumper.has(j)} onClick={() => toggleJumper(j)} />)}

      {pick && (
        <div className="tb-pickhint" style={{ left: 500, top: 1002 }}>
          {pick.kind === 'h' ? `${pick.id} selected — now click a socket (CNA1, CNA2, CNA5, CNB1, CNB2, CNB3, CNAD)` : `${pick.id} selected — now click a header (CNA, CNB, CNC, CND)`} · Esc to cancel
        </div>
      )}
    </div>
  );
}

function Lamp({ x, y, b, label, green }: { x: number; y: number; b: number; label: string; green?: boolean }) {
  const v = b <= 0.002 ? 0 : Math.min(1, Math.pow(b, 0.5));
  return <span className={'t-lamp' + (green ? ' green' : '')} style={{ left: x - 9, top: y - 13, ['--b' as any]: v }} title={`${label}: ${(b * 100).toFixed(0)}%`} />;
}

function Pot({ x, y, v, onChange, label }: { x: number; y: number; v: number; onChange: (v: number) => void; label: string }) {
  const start = useRef<{ y: number; x: number; v: number } | null>(null);
  const set = (n: number) => onChange(Math.max(0, Math.min(3.3, Math.round(n * 1000) / 1000)));
  const ang = -135 + (v / 3.3) * 270;
  return (
    <button className="t-pot" style={{ left: x - 19, top: y - 19 }} role="slider" aria-label={label} aria-valuemin={0} aria-valuemax={3.3} aria-valuenow={+v.toFixed(2)} title={`${label}: ${v.toFixed(2)} V — drag, scroll or use arrow keys`}
      onPointerDown={e => { (e.target as HTMLElement).setPointerCapture(e.pointerId); start.current = { y: e.clientY, x: e.clientX, v }; }}
      onPointerMove={e => { if (start.current) set(start.current.v + ((start.current.y - e.clientY) + (e.clientX - start.current.x)) / 120 * 3.3); }}
      onPointerUp={() => { start.current = null; }} onPointerCancel={() => { start.current = null; }}
      onWheel={e => set(v - Math.sign(e.deltaY) * 0.05)}
      onDoubleClick={() => set(1.65)}
      onKeyDown={e => {
        if (e.key === 'ArrowUp' || e.key === 'ArrowRight') { e.preventDefault(); e.stopPropagation(); set(v + (e.shiftKey ? 0.33 : 0.05)); }
        if (e.key === 'ArrowDown' || e.key === 'ArrowLeft') { e.preventDefault(); e.stopPropagation(); set(v - (e.shiftKey ? 0.33 : 0.05)); }
        if (e.key === 'Home') set(0);
        if (e.key === 'End') set(3.3);
      }}>
      <svg viewBox="0 0 38 38"><circle cx="19" cy="19" r="17" fill="#2b6fd6" stroke="#a9c4ea" strokeWidth="2" /><circle cx="19" cy="19" r="11" fill="#e8eef6" />
        <g transform={`rotate(${ang} 19 19)`}><rect x="17.2" y="7" width="3.6" height="13" rx="1.5" fill="#1d2b3a" /></g></svg>
    </button>
  );
}

function TactBtn({ x, y, down, onChange, label, cap, red }: { x: number; y: number; down: boolean; onChange: (d: boolean) => void; label: string; cap: string; red?: boolean }) {
  return (
    <button className={'t-tact' + (down ? ' down' : '') + (red ? ' red' : '')} style={{ left: x - 17, top: y - 17 }} aria-label={label} aria-pressed={down} title={label}
      onPointerDown={e => { (e.target as HTMLElement).setPointerCapture(e.pointerId); onChange(true); }}
      onPointerUp={() => onChange(false)} onPointerCancel={() => onChange(false)}
      onKeyDown={e => { if ((e.key === 'Enter' || e.key === ' ') && !e.repeat) { e.preventDefault(); e.stopPropagation(); onChange(true); } }}
      onKeyUp={e => { if (e.key === 'Enter' || e.key === ' ') { e.preventDefault(); e.stopPropagation(); onChange(false); } }}>
      <span>{cap}</span>
    </button>
  );
}

function Key({ x, y, k, down, onKey }: { x: number; y: number; k: number; down: boolean; onKey: (k: number, d: boolean) => void }) {
  const r = k >> 2, c = k & 3;
  return (
    <button className={'t-key' + (down ? ' down' : '')} style={{ left: x - 17, top: y - 17 }} aria-pressed={down}
      aria-label={`Key ${k.toString(16).toUpperCase()} (row ${r + 1}, column ${c + 1}${r === 0 ? `, K${c + 1}` : ''})`} title={`${r === 0 ? `K${c + 1}` : `SW${3 + k}`} · key ${k.toString(16).toUpperCase()}`}
      onPointerDown={e => { (e.target as HTMLElement).setPointerCapture(e.pointerId); onKey(k, true); }}
      onPointerUp={() => onKey(k, false)} onPointerCancel={() => onKey(k, false)}>
      {k.toString(16).toUpperCase()}
    </button>
  );
}

function Conn({ id, at, o, kind, connected, selected, need, target, sub, onClick }: {
  id: string; at: [number, number]; o: Orient; kind: 'h' | 's'; connected: boolean; selected: boolean; need: boolean; target: boolean; sub: string; onClick: () => void;
}) {
  const [x, y] = at;
  const w = o === 'h' ? 80 : 34, h = o === 'h' ? 34 : 80;
  const cls = ['t-conn', o, kind === 'h' ? 'hdr' : 'sock', connected && 'on', selected && 'sel', need && 'need', target && 'target'].filter(Boolean).join(' ');
  return (
    <button className={cls} style={{ left: x - w / 2, top: y - h / 2, width: w, height: h }} onClick={onClick}
      aria-label={`${kind === 'h' ? 'Header' : 'Socket'} ${id} (${sub})${connected ? ', connected' : ''}`}
      title={`${id} — ${sub}${connected ? ' · connected' : ''}${need ? ' · needed for this program' : ''}`}>
      <span className="pins">{Array.from({ length: 10 }, (_, i) => <i key={i} />)}</span>
      {connected && <span className="plug" />}
      <span className="clabel">{id}</span>
    </button>
  );
}

function JumperPart({ id, at, pins, label, on, need, onClick }: { id: Jumper; at: [number, number]; pins: 2 | 3; label: string; on: boolean; need: boolean; onClick: () => void }) {
  const [x, y] = at;
  const w = pins === 3 ? 46 : 32;
  const isPos = id === 'JP18'; // JP18 always carries its cap: 1-2 or 2-3
  const state = isPos ? (on ? 'pins 2-3' : 'pins 1-2') : on ? 'shorted' : 'open';
  return (
    <button className={'t-jmp p' + pins + (on ? ' on' : '') + (isPos ? ' pos' : '') + (need ? ' need' : '')} style={{ left: x - w / 2, top: y - 10, width: w }} onClick={onClick}
      role="switch" aria-checked={on} aria-label={`Jumper ${id} ${state}`}
      title={`${id}: ${JUMPERS[id].desc} — ${state}. Click to change.`}>
      <span className="jpins">{Array.from({ length: pins }, (_, i) => <i key={i} />)}</span>
      {(on || isPos) && <span className="cap" />}
      <span className="clabel">{label}{isPos ? (on ? ' 2-3' : ' 1-2') : on ? ' ●' : ''}</span>
    </button>
  );
}

/** Scales the fixed-size board to fit its container (or shows it at 100% with scrolling). */
export function BoardStage({ zoom, children, w = BW, h = BH }: { zoom: 'fit' | number; children: React.ReactNode; w?: number; h?: number }) {
  const host = useRef<HTMLDivElement>(null);
  const [scale, setScale] = useState(0.5);
  useLayoutEffect(() => {
    const el = host.current;
    if (!el) return;
    const fit = () => {
      const r = el.getBoundingClientRect();
      if (zoom === 'fit') setScale(Math.max(0.15, Math.min((r.width - 12) / w, (r.height - 8) / h)));
      else setScale(zoom);
    };
    fit();
    const ro = new ResizeObserver(fit);
    ro.observe(el);
    return () => ro.disconnect();
  }, [zoom, w, h]);
  return (
    <div className={'stage' + (zoom === 'fit' ? ' fit' : ' zoomed')} ref={host}>
      <div className="stage-box" style={{ width: w * scale, height: h * scale }}>
        <div className="stage-scale" style={{ transform: `scale(${scale})`, width: w, height: h }}>{children}</div>
      </div>
    </div>
  );
}
