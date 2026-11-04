import { memo, useEffect, useRef, useState } from 'react';
import { glyph } from '../sim/board/font5x7';

// ---------------- LCD ----------------
export const Lcd = memo(function Lcd({ rows, on, powered, cursor, version, cgram }: { rows: number[][]; on: boolean; powered: boolean; cursor: { r: number; c: number } | null; version: number; cgram: Uint8Array }) {
  const ref = useRef<HTMLCanvasElement>(null);
  const DOT = 3, GAP = 0.8, CH_GAP = 3.2, ROW_GAP = 5, PADX = 10, PADY = 9;
  const cw = 5 * (DOT + GAP) - GAP, chh = 8 * (DOT + GAP) - GAP;
  const W = PADX * 2 + 16 * cw + 15 * CH_GAP, H = PADY * 2 + 2 * chh + ROW_GAP;
  useEffect(() => {
    const c = ref.current;
    if (!c) return;
    const dpr = Math.min(3, window.devicePixelRatio || 1);
    c.width = Math.round(W * dpr);
    c.height = Math.round(H * dpr);
    const g = c.getContext('2d')!;
    g.setTransform(dpr, 0, 0, dpr, 0, 0);
    if (!powered) {
      g.fillStyle = '#1f2419';
      g.fillRect(0, 0, W, H);
      g.fillStyle = 'rgba(255,255,255,0.04)';
      for (let r = 0; r < 2; r++) for (let col = 0; col < 16; col++) g.fillRect(PADX + col * (cw + CH_GAP), PADY + r * (chh + ROW_GAP), cw, chh);
      return;
    }
    const grad = g.createLinearGradient(0, 0, 0, H);
    grad.addColorStop(0, '#b6d24a');
    grad.addColorStop(1, '#97b733');
    g.fillStyle = grad;
    g.fillRect(0, 0, W, H);
    for (let r = 0; r < 2; r++) {
      for (let col = 0; col < 16; col++) {
        const code = rows[r]?.[col] ?? 0x20;
        let cols: number[];
        if (code < 8) {
          // custom character from CGRAM (row-major, 5 bits)
          cols = [0, 0, 0, 0, 0];
          for (let y = 0; y < 8; y++) { const bits = cgram[code * 8 + y]; for (let x = 0; x < 5; x++) if (bits & (1 << (4 - x))) cols[x] |= 1 << y; }
        } else cols = glyph(code);
        const x0 = PADX + col * (cw + CH_GAP), y0 = PADY + r * (chh + ROW_GAP);
        const isCur = cursor && cursor.r === r && cursor.c === col;
        for (let x = 0; x < 5; x++) {
          for (let y = 0; y < 8; y++) {
            const lit = on && ((cols[x] >> y) & 1) === 1 || (isCur && on && y === 7);
            g.fillStyle = lit ? 'rgba(16, 28, 6, 0.92)' : 'rgba(40, 64, 0, 0.11)';
            g.fillRect(x0 + x * (DOT + GAP), y0 + y * (DOT + GAP), DOT, DOT);
          }
        }
      }
    }
    // soft glass reflection
    const glass = g.createLinearGradient(0, 0, 0, H * 0.55);
    glass.addColorStop(0, 'rgba(255,255,255,0.10)');
    glass.addColorStop(1, 'rgba(255,255,255,0)');
    g.fillStyle = glass;
    g.fillRect(0, 0, W, H * 0.55);
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [version, on, powered, cursor?.r, cursor?.c, rows]);
  const text = rows.map(r => r.map(ch => (ch >= 32 && ch < 127 ? String.fromCharCode(ch) : ' ')).join('')).join(' / ');
  return <canvas ref={ref} style={{ aspectRatio: `${W} / ${H}` }} role="img" aria-label={powered ? `LCD shows: ${text.trim() || '(blank)'}` : 'LCD (not powered)'} />;
});

// ---------------- 7-segment ----------------
const SEG_PATHS: string[] = [
  'M12 6 L48 6 L42 12 L18 12 Z',          // a
  'M50 8 L50 46 L44 42 L44 14 Z',          // b
  'M50 54 L50 92 L44 86 L44 58 Z',         // c
  'M12 94 L48 94 L42 88 L18 88 Z',         // d
  'M10 54 L16 58 L16 86 L10 92 Z',         // e
  'M10 8 L16 14 L16 42 L10 46 Z',          // f
  'M12 50 L18 46 L42 46 L48 50 L42 54 L18 54 Z', // g
];
export const SevenSeg = memo(function SevenSeg({ seg }: { seg: number[][] }) {
  return (
    <svg viewBox="0 0 252 108" role="img" aria-label="Seven-segment display">
      <defs>
        <filter id="seg-glow" x="-30%" y="-30%" width="160%" height="160%">
          <feGaussianBlur stdDeviation="1.6" result="b" />
          <feMerge><feMergeNode in="b" /><feMergeNode in="SourceGraphic" /></feMerge>
        </filter>
      </defs>
      {seg.map((d, di) => (
        <g key={di} transform={`translate(${di * 62 + 6} 4) skewX(-7)`}>
          {SEG_PATHS.map((p, si) => {
            const b = Math.min(1, Math.pow(Math.min(1, d[si] * 4), 0.6));
            return (
              <g key={si}>
                <path d={p} fill="#2b0f0c" />
                {b > 0.02 && <path d={p} fill="#ff3d24" opacity={b} filter="url(#seg-glow)" />}
              </g>
            );
          })}
          <circle cx="56" cy="92" r="3.6" fill="#2b0f0c" />
          {d[7] > 0.005 && <circle cx="56" cy="92" r="3.6" fill="#ff3d24" opacity={Math.min(1, Math.pow(Math.min(1, d[7] * 4), 0.6))} filter="url(#seg-glow)" />}
        </g>
      ))}
    </svg>
  );
});

// ---------------- LED ----------------
export function Led({ b, label, pin, green }: { b: number; label: string; pin?: string; green?: boolean }) {
  const v = b <= 0.002 ? 0 : Math.min(1, Math.pow(b, 0.5));
  return (
    <div className={'led' + (green ? ' green' : '')} title={`${label}${pin ? ' · ' + pin : ''}: ${(b * 100).toFixed(0)}%`}>
      <div className="lamp" style={{ ['--b' as any]: v }} />
      <div className="lab">{label}</div>
      {pin && <div className="pin">{pin}</div>}
    </div>
  );
}

// ---------------- push button ----------------
export function Tact({ down, onChange, label }: { down: boolean; onChange: (d: boolean) => void; label: string }) {
  return (
    <button
      className={'tact' + (down ? ' down' : '')}
      aria-label={label}
      aria-pressed={down}
      onPointerDown={e => { (e.target as HTMLElement).setPointerCapture(e.pointerId); onChange(true); }}
      onPointerUp={() => onChange(false)}
      onPointerCancel={() => onChange(false)}
      onKeyDown={e => { if ((e.key === 'Enter' || e.key === ' ') && !e.repeat) { e.preventDefault(); e.stopPropagation(); onChange(true); } }}
      onKeyUp={e => { if (e.key === 'Enter' || e.key === ' ') { e.preventDefault(); e.stopPropagation(); onChange(false); } }}
    />
  );
}

// ---------------- keypad ----------------
export function Keypad({ pressed, onKey }: { pressed: Set<number>; onKey: (k: number, down: boolean) => void }) {
  return (
    <div className="keypad" role="group" aria-label="4 by 4 key matrix">
      {Array.from({ length: 16 }, (_, k) => {
        const r = k >> 2, c = k & 3;
        return (
          <button
            key={k}
            className={'key' + (pressed.has(k) ? ' down' : '')}
            aria-label={`Key ${k.toString(16).toUpperCase()} (row ${r + 1}, column ${c + 1})`}
            aria-pressed={pressed.has(k)}
            onPointerDown={e => { (e.target as HTMLElement).setPointerCapture(e.pointerId); onKey(k, true); }}
            onPointerUp={() => onKey(k, false)}
            onPointerCancel={() => onKey(k, false)}
          >
            <small>{r === 0 ? `K${c + 1}` : `SW${3 + k}`}</small>
            {k.toString(16).toUpperCase()}
          </button>
        );
      })}
    </div>
  );
}

// ---------------- stepper ----------------
export const Stepper = memo(function Stepper({ angle, coils, steps }: { angle: number; coils: number[]; steps: number }) {
  const coilPos = [[60, 14], [106, 60], [60, 106], [14, 60]];
  return (
    <svg viewBox="0 0 120 120" role="img" aria-label={`Stepper motor at ${angle.toFixed(1)} degrees`}>
      <rect x="8" y="8" width="104" height="104" rx="14" fill="#1a1c1b" stroke="#3a3d3b" />
      {[[18, 18], [102, 18], [18, 102], [102, 102]].map(([x, y], i) => <circle key={i} cx={x} cy={y} r="3.2" fill="#0d0e0d" stroke="#555" strokeWidth=".8" />)}
      <circle cx="60" cy="60" r="38" fill="#262927" stroke="#444845" />
      {coilPos.map(([x, y], i) => (
        <g key={i}>
          <rect x={x - 7} y={y - 4} width="14" height="8" rx="2" fill={coils[i] ? '#e5a53a' : '#3a3324'} transform={`rotate(${i * 90} ${x} ${y})`} />
          {coils[i] ? <rect x={x - 7} y={y - 4} width="14" height="8" rx="2" fill="#ffc861" opacity=".55" filter="url(#coil-glow)" transform={`rotate(${i * 90} ${x} ${y})`} /> : null}
          <text x={i === 1 ? x - 16 : i === 3 ? x + 16 : x} y={i === 0 ? y + 16 : i === 2 ? y - 11 : y + 3} fill="#9da39e" fontSize="7.5" fontFamily="var(--mono)" textAnchor="middle">{'ABCD'[i]}</text>
        </g>
      ))}
      <defs>
        <filter id="coil-glow" x="-50%" y="-50%" width="200%" height="200%"><feGaussianBlur stdDeviation="2" /></filter>
        <radialGradient id="rotor" cx="40%" cy="35%"><stop offset="0" stopColor="#d9dcd8" /><stop offset="1" stopColor="#8e938f" /></radialGradient>
      </defs>
      <g style={{ transform: `rotate(${angle}deg)`, transformOrigin: '60px 60px', transition: 'transform 70ms linear' }}>
        <circle cx="60" cy="60" r="20" fill="url(#rotor)" />
        <path d="M60 60 L60 41" stroke="#c0392b" strokeWidth="3" strokeLinecap="round" />
        <circle cx="60" cy="60" r="6.5" fill="#bfc3bf" stroke="#727772" />
        <path d="M56 57.5 h8" stroke="#727772" strokeWidth="1.2" />
      </g>
      <text x="60" y="117" textAnchor="middle" fontSize="0" fill="transparent">{steps}</text>
    </svg>
  );
});

// ---------------- DC motor ----------------
export const DcMotor = memo(function DcMotor({ angle, speed }: { angle: number; speed: number }) {
  const blur = Math.min(1, Math.abs(speed) * 1.4);
  return (
    <svg viewBox="0 0 120 120" role="img" aria-label={`DC motor ${Math.abs(speed) < 0.02 ? 'stopped' : speed > 0 ? 'turning clockwise' : 'turning anticlockwise'}`}>
      <circle cx="60" cy="60" r="52" fill="#1a1c1b" stroke="#3a3d3b" />
      <circle cx="60" cy="60" r="44" fill="none" stroke="#2b2e2c" strokeWidth="1" strokeDasharray="2 4" />
      <g transform={`rotate(${angle} 60 60)`} opacity={1 - blur * 0.55}>
        {[0, 120, 240].map(a => (
          <path key={a} transform={`rotate(${a} 60 60)`} d="M60 60 C 54 44, 56 26, 66 18 C 74 26, 72 46, 60 60 Z" fill="#cfd3cf" stroke="#8e938f" strokeWidth=".8" />
        ))}
      </g>
      {blur > 0.05 && <circle cx="60" cy="60" r="42" fill="#cfd3cf" opacity={blur * 0.22} />}
      <circle cx="60" cy="60" r="8" fill="#9aa09b" stroke="#5f645f" />
      <circle cx="60" cy="60" r="3" fill="#3a3d3b" />
      {Math.abs(speed) > 0.03 && (
        <g fill="none" stroke="#ffbf5e" strokeWidth="2" strokeLinecap="round" opacity=".9">
          {speed > 0
            ? <><path d="M86 22 A48 48 0 0 1 104 46" /><path d="M104 46 l-1-7 M104 46 l-6.5-3" /></>
            : <><path d="M34 22 A48 48 0 0 0 16 46" /><path d="M16 46 l1-7 M16 46 l6.5-3" /></>}
        </g>
      )}
    </svg>
  );
});

// ---------------- buzzer ----------------
export function Buzzer({ on }: { on: boolean }) {
  return (
    <div className={'buzzer' + (on ? ' on' : '')}>
      <svg viewBox="0 0 64 64" role="img" aria-label={on ? 'Buzzer sounding' : 'Buzzer silent'}>
        <g className="body">
          <circle cx="32" cy="32" r="22" fill="#151615" stroke="#3b3e3c" strokeWidth="1.2" />
          <circle cx="32" cy="32" r="15" fill="none" stroke="#2c2e2d" />
          <circle cx="32" cy="32" r="4" fill="#050505" stroke="#3b3e3c" />
        </g>
        <g className="waves" fill="none" stroke="#f2c94c" strokeWidth="1.6" strokeLinecap="round">
          <path d="M57 24 a12 12 0 0 1 0 16" />
          <path d="M61 19 a18 18 0 0 1 0 26" />
          <path d="M65 14 a25 25 0 0 1 0 36" />
        </g>
      </svg>
    </div>
  );
}

// ---------------- relay ----------------
export function Relay({ on }: { on: boolean }) {
  return (
    <div className="relay">
      <svg viewBox="0 0 64 64" role="img" aria-label={on ? 'Relay energised' : 'Relay off'}>
        <rect x="6" y="12" width="44" height="40" rx="4" fill="#1f5fae" stroke="#174a87" />
        <rect x="10" y="16" width="36" height="9" rx="1.5" fill="#2a6fc2" />
        <text x="28" y="23" fontSize="6" fill="#d6e6ff" textAnchor="middle" fontFamily="var(--mono)">5V RELAY</text>
        <circle cx="16" cy="40" r="3" fill="#cfd6df" />
        <circle cx="40" cy="34" r="3" fill="#cfd6df" />
        <circle cx="40" cy="46" r="3" fill="#cfd6df" />
        <path d={on ? 'M16 40 L39 35' : 'M16 40 L39 45'} stroke="#f4f4f4" strokeWidth="2.2" strokeLinecap="round" style={{ transition: 'd .06s' }} />
        <circle cx="57" cy="20" r="4" fill={on ? '#ff3b26' : '#3d1512'} />
        {on && <circle cx="57" cy="20" r="7" fill="#ff3b26" opacity=".35" />}
      </svg>
    </div>
  );
}

// ---------------- knob ----------------
export function Knob({ value, onChange, max = 3.3, label }: { value: number; onChange: (v: number) => void; max?: number; label: string }) {
  const [drag, setDrag] = useState(false);
  const start = useRef<{ y: number; x: number; v: number } | null>(null);
  const frac = value / max;
  const ang = -135 + frac * 270;
  const arc = (a0: number, a1: number, r: number) => {
    const p = (a: number) => [27 + r * Math.sin(a * Math.PI / 180), 27 - r * Math.cos(a * Math.PI / 180)];
    const [x0, y0] = p(a0), [x1, y1] = p(a1);
    return `M${x0} ${y0} A${r} ${r} 0 ${a1 - a0 > 180 ? 1 : 0} 1 ${x1} ${y1}`;
  };
  const set = (v: number) => onChange(Math.max(0, Math.min(max, Math.round(v * 1000) / 1000)));
  return (
    <button
      className="knob"
      role="slider"
      aria-label={label}
      aria-valuemin={0}
      aria-valuemax={max}
      aria-valuenow={+value.toFixed(2)}
      aria-valuetext={`${value.toFixed(2)} volts`}
      onPointerDown={e => { (e.target as HTMLElement).setPointerCapture(e.pointerId); start.current = { y: e.clientY, x: e.clientX, v: value }; setDrag(true); }}
      onPointerMove={e => { if (!start.current) return; const d = (start.current.y - e.clientY) + (e.clientX - start.current.x); set(start.current.v + d / 160 * max); }}
      onPointerUp={() => { start.current = null; setDrag(false); }}
      onPointerCancel={() => { start.current = null; setDrag(false); }}
      onWheel={e => { set(value - Math.sign(e.deltaY) * max / 66); }}
      onDoubleClick={() => set(max / 2)}
      onKeyDown={e => {
        const step = e.shiftKey ? max / 10 : max / 66;
        if (e.key === 'ArrowUp' || e.key === 'ArrowRight') { e.preventDefault(); e.stopPropagation(); set(value + step); }
        if (e.key === 'ArrowDown' || e.key === 'ArrowLeft') { e.preventDefault(); e.stopPropagation(); set(value - step); }
        if (e.key === 'Home') set(0);
        if (e.key === 'End') set(max);
      }}
    >
      <svg viewBox="0 0 54 54">
        <path d={arc(-135, 135, 24)} stroke="rgba(231,237,228,.18)" strokeWidth="3" fill="none" strokeLinecap="round" />
        {frac > 0.005 && <path d={arc(-135, ang, 24)} stroke="#e2c27a" strokeWidth="3" fill="none" strokeLinecap="round" />}
        <circle cx="27" cy="27" r="17" fill="#2f3230" stroke={drag ? '#e2c27a' : '#4a4e4b'} />
        <circle cx="27" cy="27" r="13" fill="#3a3d3b" />
        <g transform={`rotate(${ang} 27 27)`}><path d="M27 27 L27 13" stroke="#f1f1ec" strokeWidth="2.4" strokeLinecap="round" /></g>
      </svg>
    </button>
  );
}
