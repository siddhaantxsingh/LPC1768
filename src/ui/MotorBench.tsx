import { memo } from 'react';
import type { BoardSnapshot } from '../sim/board/machine';

export const MW = 1440;
export const MH = 300;

/**
 * The stepper and DC motor are separate units on the bench, wired to the board's
 * CNA5 (stepper / DC-motor control) connector. Drawn in 3D perspective.
 */
export const MotorBench = memo(function MotorBench({ snap, connected }: { snap: BoardSnapshot | null; connected: boolean }) {
  const ang = snap?.stepper.angle ?? 0;
  const dcAng = snap?.dc.angle ?? 0;
  const sp = snap?.dc.speed ?? 0;
  const coils = snap?.stepper.coils ?? [0, 0, 0, 0];
  const blur = Math.min(1, Math.abs(sp) * 1.6);
  const wire = connected ? undefined : '6 6';
  // coupler marker on the DC shaft (a disc seen edge-on: an ellipse)
  const rad = (dcAng * Math.PI) / 180;
  const mx = 214 + 9 * Math.cos(rad);
  const my = 168 + 40 * Math.sin(rad);
  const front = Math.cos(rad) > 0;
  return (
    <svg className="motor-bench" viewBox={`0 0 ${MW} ${MH}`} width={MW} height={MH} role="img"
      aria-label={`Motors: DC motor ${Math.abs(sp) < 0.02 ? 'stopped' : sp > 0 ? 'clockwise' : 'anticlockwise'}, stepper at ${ang.toFixed(1)} degrees`}>
      <defs>
        <linearGradient id="mb-can" x1="0" y1="0" x2="0" y2="1">
          <stop offset="0" stopColor="#f4f6f7" /><stop offset=".18" stopColor="#d4d9dc" /><stop offset=".5" stopColor="#9aa2a8" /><stop offset=".78" stopColor="#c9cfd3" /><stop offset="1" stopColor="#7b838a" />
        </linearGradient>
        <linearGradient id="mb-face" x1="0" y1="0" x2="1" y2="1"><stop offset="0" stopColor="#eef1f3" /><stop offset="1" stopColor="#a7aeb4" /></linearGradient>
        <linearGradient id="mb-plate" x1="0" y1="0" x2="1" y2="1"><stop offset="0" stopColor="#f2f4f5" /><stop offset=".55" stopColor="#c4cacf" /><stop offset="1" stopColor="#8d959b" /></linearGradient>
        <linearGradient id="mb-body" x1="0" y1="0" x2="0" y2="1"><stop offset="0" stopColor="#3a3d40" /><stop offset=".5" stopColor="#1b1d1f" /><stop offset="1" stopColor="#0d0e0f" /></linearGradient>
        <linearGradient id="mb-shaft" x1="0" y1="0" x2="0" y2="1"><stop offset="0" stopColor="#fafbfb" /><stop offset=".5" stopColor="#a9b0b5" /><stop offset="1" stopColor="#6d757b" /></linearGradient>
        <radialGradient id="mb-shadow"><stop offset="0" stopColor="rgba(0,0,0,.35)" /><stop offset="1" stopColor="rgba(0,0,0,0)" /></radialGradient>
      </defs>

      {/* bench surface */}
      <rect x="0" y="0" width={MW} height={MH} rx="18" className="mb-surface" />

      {/* CNA5 harness plug at the top, coming down from the board */}
      <g transform="translate(700 6)">
        <rect x={connected ? -46 : -110} y="0" width={connected ? 92 : 220} height="26" rx="4" fill={connected ? '#3a3d3b' : '#7a4a12'} stroke="#5c605d" />
        <text x="0" y="17" textAnchor="middle" className="mb-plug">{connected ? 'CNA5' : 'CNA5 · not connected'}</text>
      </g>
      {/* DC motor leads (red/black) */}
      <path d="M690 32 C 690 90, 520 70, 470 118" stroke="#c0392b" strokeWidth="5" fill="none" strokeDasharray={wire} strokeLinecap="round" />
      <path d="M680 32 C 680 100, 520 86, 470 132" stroke="#1d1f20" strokeWidth="5" fill="none" strokeDasharray={wire} strokeLinecap="round" />
      {/* stepper leads (A B C D) */}
      {['#c0392b', '#2471a3', '#27ae60', '#1d1f20'].map((c, i) => (
        <path key={i} d={`M${706 + i * 7} 32 C ${706 + i * 7} 110, ${1000 + i * 4} 120, ${1100 + i * 6} ${222 + i * 3}`} stroke={c} strokeWidth="4.5" fill="none" strokeDasharray={wire} strokeLinecap="round" />
      ))}

      {/* ===================== DC motor ===================== */}
      <ellipse cx="330" cy="246" rx="210" ry="18" fill="url(#mb-shadow)" />
      {/* body (cylinder lying on its side) */}
      <path d="M250 88 H460 A26 80 0 0 1 460 248 H250 Z" fill="url(#mb-can)" stroke="#6c747a" />
      {/* vents */}
      {[290, 330, 370, 410].map(x => <rect key={x} x={x} y="104" width="18" height="10" rx="3" fill="#2e3336" opacity=".75" />)}
      {[290, 330, 370, 410].map(x => <rect key={'b' + x} x={x} y="222" width="18" height="9" rx="3" fill="#2e3336" opacity=".55" />)}
      {/* rear end with terminals */}
      <ellipse cx="460" cy="168" rx="26" ry="80" fill="#8f979d" stroke="#6c747a" />
      <rect x="452" y="110" width="14" height="22" rx="2" fill="#c9a24a" />
      <rect x="452" y="200" width="14" height="22" rx="2" fill="#c9a24a" />
      {/* front end cap */}
      <ellipse cx="250" cy="168" rx="30" ry="80" fill="url(#mb-face)" stroke="#6c747a" />
      <ellipse cx="248" cy="168" rx="14" ry="36" fill="#d8dde0" stroke="#8a9298" />
      {[[-48], [48]].map(([dy], i) => <ellipse key={i} cx="244" cy={168 + dy} rx="7" ry="14" fill="#3b4246" opacity=".8" />)}
      {/* shaft */}
      <rect x="196" y="161" width="52" height="14" rx="3" fill="url(#mb-shaft)" />
      {/* coupler disc on the shaft, spinning */}
      <ellipse cx="214" cy="168" rx="11" ry="44" fill="#e2a33a" stroke="#9c6b1c" strokeWidth="2" />
      {blur > 0.05 && <ellipse cx="214" cy="168" rx="11" ry="44" fill="#fff3dd" opacity={blur * 0.45} />}
      <circle cx={mx} cy={my} r="7" fill={front ? '#1d1f20' : '#5e4214'} opacity={1 - blur * 0.7} />
      {Math.abs(sp) > 0.03 && (
        <path d={sp > 0 ? 'M180 104 A 42 60 0 0 0 180 232' : 'M180 232 A 42 60 0 0 1 180 104'} fill="none" stroke="#e8963a" strokeWidth="4" strokeLinecap="round"
          markerEnd="" />
      )}
      {Math.abs(sp) > 0.03 && <path d={sp > 0 ? 'M180 232 l-12 -4 l8 12 z' : 'M180 104 l-12 4 l8 -12 z'} fill="#e8963a" />}
      <text x="330" y="282" textAnchor="middle" className="mb-title">DC motor</text>
      <text x="330" y="70" textAnchor="middle" className="mb-read">{Math.round(Math.abs(sp) * 1500)} rpm · {sp > 0.02 ? 'clockwise' : sp < -0.02 ? 'anticlockwise' : 'stopped'}</text>

      {/* ===================== stepper (NEMA style) ===================== */}
      <ellipse cx="1110" cy="268" rx="230" ry="16" fill="url(#mb-shadow)" />
      {/* body extrusion going back/right */}
      <path d="M1080 76 L1170 46 L1350 46 L1260 76 Z" fill="#2c2f31" />
      <path d="M1260 76 L1350 46 L1350 216 L1260 246 Z" fill="url(#mb-body)" />
      {Array.from({ length: 9 }, (_, i) => <path key={i} d={`M${1274 + i * 8} ${72 - i * 2.6} L${1274 + i * 8} ${242 - i * 2.6}`} stroke="#000" strokeOpacity=".45" strokeWidth="2" />)}
      {/* rear plate */}
      <path d="M1336 50 L1350 46 L1350 216 L1336 221 Z" fill="#b9c0c5" />
      {/* black laminated stack seen from the front-top */}
      <rect x="1100" y="76" width="160" height="170" fill="url(#mb-body)" />
      {Array.from({ length: 12 }, (_, i) => <line key={i} x1="1100" x2="1260" y1={84 + i * 13.5} y2={84 + i * 13.5} stroke="#000" strokeOpacity=".35" />)}
      {/* front plate */}
      <path d="M940 88 L948 80 H1092 L1100 88 V238 L1092 246 H948 L940 238 Z" fill="url(#mb-plate)" stroke="#7e868c" />
      <path d="M1092 80 L1112 72 L1120 80 L1100 88 Z" fill="#c4cacf" />
      <path d="M1100 88 L1120 80 V230 L1100 238 Z" fill="#9aa2a8" />
      {[[956, 96], [1084, 96], [956, 230], [1084, 230]].map(([x, y], i) => <g key={i}><circle cx={x} cy={y} r="7" fill="#4b5257" /><circle cx={x} cy={y} r="3.5" fill="#222" /></g>)}
      <circle cx="1020" cy="163" r="44" fill="#d2d7db" stroke="#8a9298" strokeWidth="2" />
      <circle cx="1020" cy="163" r="34" fill="#b5bcc1" />
      {/* rotor pointer disc on the shaft — turns with the real step count */}
      <g style={{ transform: `rotate(${ang}deg)`, transformOrigin: '1020px 163px', transition: 'transform 70ms linear' }}>
        <circle cx="1020" cy="163" r="28" fill="#f4f1e8" stroke="#6b7278" strokeWidth="1.5" />
        {Array.from({ length: 12 }, (_, i) => <line key={i} x1="1020" y1="137" x2="1020" y2={i % 3 === 0 ? 143 : 140} stroke="#6b7278" strokeWidth="1.5" transform={`rotate(${i * 30} 1020 163)`} />)}
        <path d="M1020 163 L1020 138" stroke="#c0392b" strokeWidth="4" strokeLinecap="round" />
        <circle cx="1020" cy="163" r="8" fill="url(#mb-shaft)" stroke="#5f666b" />
        <rect x="1016.5" y="158" width="7" height="2.5" fill="#5f666b" />
      </g>
      {/* coil indicator strip on the motor connector */}
      <g transform="translate(1166 252)">
        {['A', 'B', 'C', 'D'].map((c, i) => (
          <g key={c} transform={`translate(${i * 24} 0)`}>
            <circle r="7" fill={coils[i] ? '#ffb43b' : '#3b3325'} stroke="#151515" />
            {coils[i] ? <circle r="11" fill="#ffb43b" opacity=".3" /> : null}
            <text y="22" textAnchor="middle" className="mb-coil">{c}</text>
          </g>
        ))}
      </g>
      <text x="1020" y="282" textAnchor="middle" className="mb-title">Stepper motor · 1.8°/step</text>
      <text x="1110" y="34" textAnchor="middle" className="mb-read">{ang.toFixed(1)}° · {snap?.stepper.steps ?? 0} steps{snap && snap.stepper.dir ? (snap.stepper.dir > 0 ? ' · clockwise' : ' · anticlockwise') : ''}</text>
    </svg>
  );
});
