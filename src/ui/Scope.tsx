import { useEffect, useRef, useState } from 'react';
import type { Board } from '../sim/board/machine';
import { audio } from '../bench/audio';
import { fmtHz } from './BoardView';

export const SCOPE_SOURCES = ['off', 'P1.23', 'DAC', 'P0.4', 'P0.5', 'P0.6', 'P0.7', 'P0.8', 'P0.9', 'P0.10', 'P0.11', 'P1.24', 'P1.25', 'P1.26', 'P2.10', 'P2.11', 'P2.12', 'P2.13', 'P0.26', 'P0.27', 'P0.28'];
const SRC_LABEL: Record<string, string> = { 'P1.23': 'P1.23 · TP5', DAC: 'AOUT · TP8', 'P0.11': 'P0.11 · buzzer', 'P0.8': 'P0.8 · relay', 'P0.9': 'P0.9 · DC enable' };
const TIMEBASES = [0.01, 0.02, 0.05, 0.1, 0.2, 0.5, 1, 2, 5, 10, 20, 50, 100, 200, 500];

interface Meas { freq: number; duty: number; vmin: number; vmax: number; vavg: number; n: number }

export function Scope({ board, running, defaults }: { board: Board; running: boolean; defaults?: { a?: string; b?: string; tb?: number } }) {
  const ref = useRef<HTMLCanvasElement>(null);
  const [a, setA] = useState(defaults?.a ?? (defaults?.b ? 'off' : 'P1.23'));
  const [b, setB] = useState(defaults?.b ?? (defaults?.a ? 'off' : 'DAC'));
  const [tb, setTb] = useState(defaults?.tb ?? 1);
  const [trig, setTrig] = useState(true);
  const [listen, setListen] = useState(false);
  const [meas, setMeas] = useState<{ a: Meas | null; b: Meas | null }>({ a: null, b: null });
  const runRef = useRef(running);
  runRef.current = running;

  useEffect(() => {
    if (defaults?.a || defaults?.b) { setA(defaults.a ?? 'off'); setB(defaults.b ?? 'off'); }
    if (defaults?.tb) setTb(defaults.tb);
  }, [defaults?.a, defaults?.b, defaults?.tb]);

  useEffect(() => () => audio.setProbe(null), []);

  useEffect(() => {
    let raf = 0;
    let frame = 0;
    const draw = () => {
      raf = requestAnimationFrame(draw);
      const c = ref.current;
      if (!c) return;
      const rect = c.getBoundingClientRect();
      if (rect.width < 10) return;
      const dpr = Math.min(2, window.devicePixelRatio || 1);
      if (c.width !== Math.round(rect.width * dpr) || c.height !== Math.round(rect.height * dpr)) {
        c.width = Math.round(rect.width * dpr);
        c.height = Math.round(rect.height * dpr);
      }
      const g = c.getContext('2d')!;
      g.setTransform(dpr, 0, 0, dpr, 0, 0);
      const W = rect.width, H = rect.height;
      g.fillStyle = '#0b0f0c';
      g.fillRect(0, 0, W, H);
      // graticule
      g.strokeStyle = 'rgba(120, 200, 150, 0.09)';
      g.lineWidth = 1;
      for (let i = 1; i < 10; i++) { const x = Math.round(W * i / 10) + 0.5; g.beginPath(); g.moveTo(x, 0); g.lineTo(x, H); g.stroke(); }
      for (let i = 1; i < 8; i++) { const y = Math.round(H * i / 8) + 0.5; g.beginPath(); g.moveTo(0, y); g.lineTo(W, y); g.stroke(); }
      g.strokeStyle = 'rgba(120, 200, 150, 0.22)';
      g.beginPath(); g.moveTo(0, Math.round(H / 2) + .5); g.lineTo(W, Math.round(H / 2) + .5); g.stroke();
      g.beginPath(); g.moveTo(Math.round(W / 2) + .5, 0); g.lineTo(Math.round(W / 2) + .5, H); g.stroke();

      const span = tb * 10 * 1e6; // ns
      const now = board.ns();
      const chans = [a, b].filter(x => x !== 'off');
      let t1 = now;
      // trigger on channel A (or B) rising edge
      if (trig && chans.length) {
        const tr = findTrigger(board, chans[0], now, span);
        if (tr !== null) t1 = tr + span * 0.9;
      }
      const t0 = t1 - span;
      const both = a !== 'off' && b !== 'off';
      const ms: { a: Meas | null; b: Meas | null } = { a: null, b: null };
      ([['a', a, '#f2c94c'], ['b', b, '#56ccf2']] as const).forEach(([key, src, col], idx) => {
        if (src === 'off') return;
        const top = both ? (idx === 0 ? 0.06 : 0.54) : 0.08;
        const bot = both ? (idx === 0 ? 0.46 : 0.94) : 0.92;
        const yOf = (v: number) => H * (bot - (bot - top) * (v / 3.3));
        const pts = traceSamples(board, src, t0, t1, W);
        g.strokeStyle = col;
        g.lineWidth = 1.6;
        g.shadowColor = col;
        g.shadowBlur = 6;
        g.beginPath();
        pts.forEach((p, i) => { const x = (p[0] - t0) / span * W; const y = yOf(p[1]); if (i === 0) g.moveTo(x, y); else g.lineTo(x, y); });
        g.stroke();
        g.shadowBlur = 0;
        g.fillStyle = col;
        g.font = '600 10px IBM Plex Mono, monospace';
        g.fillText(`${key.toUpperCase()}  ${SRC_LABEL[src] ?? src}`, 8, H * top + 12);
        ms[key] = measure(pts, t0, t1);
      });
      g.fillStyle = 'rgba(200, 230, 210, 0.55)';
      g.font = '500 10px IBM Plex Mono, monospace';
      g.fillText(`${tb >= 1 ? tb + ' ms' : tb * 1000 + ' µs'}/div   ${both ? '1 V/div' : '0.5 V/div'}   ${trig ? 'TRIG ↑' : 'ROLL'}`, 8, H - 8);
      if (!runRef.current) { g.fillStyle = 'rgba(242, 201, 76, .8)'; g.fillText('STOPPED', W - 64, 14); }
      if ((frame++ & 7) === 0) {
        setMeas(ms);
        if (listen && ms.a && ms.a.freq > 20) audio.setProbe({ freq: ms.a.freq, duty: ms.a.duty }); else audio.setProbe(null);
      }
    };
    raf = requestAnimationFrame(draw);
    return () => cancelAnimationFrame(raf);
  }, [board, a, b, tb, trig, listen]);

  const m = (x: Meas | null, analog: boolean) => !x ? <span className="muted">—</span> : analog
    ? <><b>{x.vmin.toFixed(2)}–{x.vmax.toFixed(2)} V</b><br />avg {x.vavg.toFixed(2)} V{x.freq > 0 ? <> · {fmtHz(x.freq)}</> : null}</>
    : <><b>{x.freq > 0 ? fmtHz(x.freq) : x.vmax > 1.6 ? 'HIGH' : 'LOW'}</b>{x.freq > 0 ? <> · duty {(x.duty * 100).toFixed(1)}%</> : null}</>;

  return (
    <div className="scope">
      <div className="scope-screen"><canvas ref={ref} aria-label="Oscilloscope" /></div>
      <div className="scope-side">
        <label><span className="ch-a">Channel A</span>
          <select value={a} onChange={e => setA(e.target.value)}>{SCOPE_SOURCES.map(s => <option key={s} value={s}>{s === 'off' ? 'Off' : SRC_LABEL[s] ?? s}</option>)}</select>
        </label>
        <div className="meas">{m(meas.a, a === 'DAC')}</div>
        <label><span className="ch-b">Channel B</span>
          <select value={b} onChange={e => setB(e.target.value)}>{SCOPE_SOURCES.map(s => <option key={s} value={s}>{s === 'off' ? 'Off' : SRC_LABEL[s] ?? s}</option>)}</select>
        </label>
        <div className="meas">{m(meas.b, b === 'DAC')}</div>
        <label>Time / div
          <select value={tb} onChange={e => setTb(Number(e.target.value))}>{TIMEBASES.map(t => <option key={t} value={t}>{t >= 1 ? `${t} ms` : `${t * 1000} µs`}</option>)}</select>
        </label>
        <label className="check"><input type="checkbox" checked={trig} onChange={e => setTrig(e.target.checked)} /> Trigger on rising edge</label>
        <label className="check"><input type="checkbox" checked={listen} onChange={e => { setListen(e.target.checked); if (e.target.checked) audio.resume(); }} /> Listen to channel A</label>
      </div>
    </div>
  );
}

function parseSrc(src: string): { port: number; bit: number } | null {
  const m = /^P(\d)\.(\d+)$/.exec(src);
  return m ? { port: Number(m[1]), bit: Number(m[2]) } : null;
}

/** Level of a digital pin from the trace ring buffer at time t (binary search would be faster; buffers are modest). */
function digitalPoints(board: Board, port: number, bit: number, t0: number, t1: number): [number, number][] {
  const n = board.traceCount, N = board.traceN, head = board.traceHead;
  const vals = port === 0 ? board.traceV0 : port === 1 ? board.traceV1 : board.traceV2;
  const idx = (k: number) => (head - n + k + N) & (N - 1);
  // find first index with t >= t0 by binary search
  let lo = 0, hi = n;
  while (lo < hi) { const mid = (lo + hi) >> 1; if (board.traceT[idx(mid)] < t0) lo = mid + 1; else hi = mid; }
  let level = lo > 0 ? (vals[idx(lo - 1)] >>> bit) & 1 : n > 0 ? 0 : ((board.ports[port].latch & board.drivenMask(port)) >>> bit) & 1;
  const pts: [number, number][] = [[t0, level * 3.3]];
  for (let k = lo; k < n; k++) {
    const i = idx(k);
    const t = board.traceT[i];
    if (t > t1) break;
    const l = (vals[i] >>> bit) & 1;
    if (l !== level) { pts.push([t, level * 3.3], [t, l * 3.3]); level = l; }
    if (pts.length > 20000) break;
  }
  pts.push([t1, level * 3.3]);
  return pts;
}

function traceSamples(board: Board, src: string, t0: number, t1: number, W: number): [number, number][] {
  if (src === 'DAC') {
    const n = board.dacCount, N = board.dacN, head = board.dacHead;
    const idx = (k: number) => (head - n + k + N) & (N - 1);
    let lo = 0, hi = n;
    while (lo < hi) { const mid = (lo + hi) >> 1; if (board.dacT[idx(mid)] < t0) lo = mid + 1; else hi = mid; }
    let v = lo > 0 ? board.dacV[idx(lo - 1)] : 0;
    const pts: [number, number][] = [[t0, v]];
    const step = Math.max(1, Math.floor((n - lo) / (W * 4)));
    for (let k = lo; k < n; k += step) {
      const i = idx(k);
      const t = board.dacT[i];
      if (t > t1) break;
      pts.push([t, v], [t, board.dacV[i]]);
      v = board.dacV[i];
    }
    pts.push([t1, v]);
    return pts;
  }
  const p = parseSrc(src);
  if (!p) return [];
  const ch = board.pwmOnPin(p.port, p.bit);
  if (ch) {
    const pts: [number, number][] = [];
    const n = Math.max(200, Math.floor(W * 3));
    let prev = -1;
    for (let i = 0; i <= n; i++) {
      const t = t0 + (t1 - t0) * i / n;
      const l = board.pinLevelAt(p.port, p.bit, t, 0);
      if (l !== prev) { if (prev >= 0) pts.push([t, prev * 3.3]); pts.push([t, l * 3.3]); prev = l; }
    }
    pts.push([t1, prev * 3.3]);
    return pts;
  }
  return digitalPoints(board, p.port, p.bit, t0, t1);
}

function findTrigger(board: Board, src: string, now: number, span: number): number | null {
  // look for the latest rising edge that leaves 90% of the screen after it
  const lookback = span * 6;
  const pts = traceSamples(board, src, now - lookback, now, 2000);
  if (pts.length < 3) return null;
  let vmin = Infinity, vmax = -Infinity;
  for (const p of pts) { vmin = Math.min(vmin, p[1]); vmax = Math.max(vmax, p[1]); }
  if (vmax - vmin < 0.2) return null;
  const mid = (vmin + vmax) / 2;
  for (let i = pts.length - 1; i > 0; i--) {
    if (pts[i - 1][1] < mid && pts[i][1] >= mid && pts[i][0] <= now - span * 0.9) return pts[i][0];
  }
  return null;
}

function measure(pts: [number, number][], t0: number, t1: number): Meas | null {
  if (pts.length < 2) return null;
  let vmin = Infinity, vmax = -Infinity, area = 0;
  for (let i = 1; i < pts.length; i++) {
    const [ta, va] = pts[i - 1];
    const [tb] = pts[i];
    area += va * (tb - ta);
    vmin = Math.min(vmin, va); vmax = Math.max(vmax, va);
  }
  vmin = Math.min(vmin, pts[pts.length - 1][1]); vmax = Math.max(vmax, pts[pts.length - 1][1]);
  const vavg = area / (t1 - t0);
  const mid = (vmin + vmax) / 2;
  const rises: number[] = [];
  let high = 0;
  for (let i = 1; i < pts.length; i++) {
    if (pts[i - 1][1] < mid && pts[i][1] >= mid) rises.push(pts[i][0]);
  }
  for (let i = 1; i < pts.length; i++) if (pts[i - 1][1] >= mid) high += pts[i][0] - pts[i - 1][0];
  let freq = 0, duty = 0;
  if (rises.length >= 2 && vmax - vmin > 0.2) {
    const per = (rises[rises.length - 1] - rises[0]) / (rises.length - 1);
    freq = 1e9 / per;
    // duty over whole periods only
    let hi = 0;
    for (let i = 1; i < pts.length; i++) {
      const ta = Math.max(pts[i - 1][0], rises[0]), tb = Math.min(pts[i][0], rises[rises.length - 1]);
      if (tb > ta && pts[i - 1][1] >= mid) hi += tb - ta;
    }
    duty = hi / (rises[rises.length - 1] - rises[0]);
  } else duty = high / (t1 - t0);
  return { freq, duty, vmin, vmax, vavg, n: pts.length };
}
