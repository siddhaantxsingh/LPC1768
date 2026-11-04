import { lazy, Suspense, useEffect, useRef, useState } from 'react';
import { useRoute, href } from './bench/router';
import { EXPERIMENTS } from './content/experiments';
import { Home } from './ui/Home';
const Workbench = lazy(() => import('./ui/Workbench').then(m => ({ default: m.Workbench })));
import { ChipMark, IChevron, IHelp, IMoon, IMute, ISound, ISun } from './ui/icons';
import { audio } from './bench/audio';

type Theme = 'light' | 'dark';

export function App() {
  const route = useRoute();
  // dark by default; the light/dark switch remembers the visitor's own choice
  const [theme, setTheme] = useState<Theme>(() => (document.documentElement.dataset.theme as Theme) || 'dark');
  const [muted, setMuted] = useState(audio.muted);
  const [help, setHelp] = useState(false);

  useEffect(() => {
    document.documentElement.dataset.theme = theme;
    try { localStorage.setItem('bench:theme', theme); } catch { /* ignore */ }
    const meta = document.querySelectorAll('meta[name="theme-color"]');
    meta.forEach(m => m.setAttribute('content', theme === 'dark' ? '#0e0f0e' : '#f2efe8'));
  }, [theme]);

  useEffect(() => {
    const exp = route.page === 'exp' ? EXPERIMENTS.find(e => e.no === route.exp) : null;
    document.title = exp ? `Exp ${exp.no} · ${exp.short} — Bench` : route.page === 'play' ? 'Scratchpad — Bench' : 'Bench — LPC1768 & ARM7 lab';
  }, [route]);

  useEffect(() => {
    const onKey = (e: KeyboardEvent) => {
      if (e.key === '?' && !(e.target instanceof HTMLInputElement) && !(e.target as HTMLElement)?.closest?.('.cm-editor')) setHelp(h => !h);
      if (e.key === 'Escape') setHelp(false);
    };
    window.addEventListener('keydown', onKey);
    return () => window.removeEventListener('keydown', onKey);
  }, []);

  const toggleMute = () => { const m = !muted; audio.setMuted(m); setMuted(m); };

  return (
    <div className="app">
      <header className="topbar">
        <a className="brand" href={href.home()} aria-label="Bench home">
          <ChipMark className="brand-mark" />
          <span className="brand-name">Bench</span>
          <span className="brand-sub">ECE 3143 · MES lab</span>
        </a>
        {route.page === 'exp' && <ExpPicker current={route.exp} />}
        {route.page === 'play' && <div className="crumbs"><span className="sep">/</span><span>Scratchpad · {route.lang === 'c' ? 'Embedded C' : 'ARM7 assembly'}</span></div>}
        <div className="spacer" />
        <span className="credit" aria-label="Made by Siddhant Singh">made by <b>Siddhant Singh</b></span>
        <button className="icon-btn" onClick={toggleMute} aria-pressed={!muted} title={muted ? 'Sound is off — turn on to hear the buzzer and relay' : 'Sound on'} aria-label="Toggle sound">
          {muted ? <IMute /> : <ISound />}
        </button>
        <button
          className="theme-switch"
          role="switch"
          aria-checked={theme === 'dark'}
          aria-label="Dark mode"
          title={theme === 'dark' ? 'Switch to light mode' : 'Switch to dark mode'}
          onClick={() => setTheme(theme === 'dark' ? 'light' : 'dark')}
        >
          <span className="ts-icon ts-sun"><ISun /></span>
          <span className="ts-icon ts-moon"><IMoon /></span>
          <span className="ts-knob" />
        </button>
        <button className="icon-btn" onClick={() => setHelp(true)} title="Keyboard shortcuts (?)" aria-label="Help"><IHelp /></button>
      </header>
      {route.page === 'home' && <Home />}
      <Suspense fallback={<div className="wb-loading" />}>
        {route.page === 'exp' && <Workbench key={'exp' + route.exp} expNo={route.exp} progId={route.prog} />}
        {route.page === 'play' && <Workbench key={'play' + route.lang} playground={route.lang} />}
      </Suspense>
      {help && <HelpModal onClose={() => setHelp(false)} />}
    </div>
  );
}

function ExpPicker({ current }: { current: number }) {
  const [open, setOpen] = useState(false);
  const ref = useRef<HTMLDivElement>(null);
  const exp = EXPERIMENTS.find(e => e.no === current);
  useEffect(() => {
    if (!open) return;
    const on = (e: MouseEvent) => { if (!ref.current?.contains(e.target as Node)) setOpen(false); };
    window.addEventListener('mousedown', on);
    return () => window.removeEventListener('mousedown', on);
  }, [open]);
  return (
    <div className="picker" ref={ref}>
      <button className="picker-btn" onClick={() => setOpen(o => !o)} aria-expanded={open}>
        <span className="no">{String(current).padStart(2, '0')}</span>
        <span className="t">{exp?.short ?? 'Experiment'}</span>
        <IChevron />
      </button>
      {open && (
        <div className="menu" role="menu">
          <div className="group">ARM7 assembly</div>
          {EXPERIMENTS.filter(e => e.lang === 'asm').map(e => (
            <a key={e.no} href={href.exp(e.no)} aria-current={e.no === current} onClick={() => setOpen(false)}>
              <span className="no">{String(e.no).padStart(2, '0')}</span><span>{e.short}</span>
            </a>
          ))}
          <div className="group">LPC1768 embedded C</div>
          {EXPERIMENTS.filter(e => e.lang === 'c').map(e => (
            <a key={e.no} href={href.exp(e.no)} aria-current={e.no === current} onClick={() => setOpen(false)}>
              <span className="no">{String(e.no).padStart(2, '0')}</span><span>{e.short}</span>
            </a>
          ))}
          <div className="group">Scratchpad</div>
          <a href={href.play('c')} onClick={() => setOpen(false)}><span className="no">C</span><span>Blank C project</span></a>
          <a href={href.play('asm')} onClick={() => setOpen(false)}><span className="no">S</span><span>Blank assembly file</span></a>
        </div>
      )}
    </div>
  );
}

function HelpModal({ onClose }: { onClose: () => void }) {
  const mod = /Mac|iPhone|iPad/.test(navigator.platform) ? '⌘' : 'Ctrl';
  const rows: [string, string][] = [
    ['Build and run', `${mod} Enter`],
    ['Run / continue', 'F5'],
    ['Pause', 'F6'],
    ['Step over', 'F10'],
    ['Step into', 'F11'],
    ['Step out', 'Shift F11'],
    ['Reset', `${mod} Shift R`],
    ['Save', `${mod} S`],
    ['Toggle breakpoint', 'Click the gutter'],
    ['Keypad keys', '0–9, A–F (when the editor is not focused)'],
    ['SW2 (EINT2)', 'Space'],
    ['This help', '?'],
  ];
  return (
    <div className="modal-back" onMouseDown={onClose}>
      <div className="modal" onMouseDown={e => e.stopPropagation()} role="dialog" aria-label="Keyboard shortcuts">
        <h2>Shortcuts</h2>
        <div className="body">
          <table className="keys"><tbody>
            {rows.map(([a, b]) => <tr key={a}><td>{a}</td><td><kbd>{b}</kbd></td></tr>)}
          </tbody></table>
          <p style={{ marginTop: 16 }}>Your edits are saved in this browser automatically. Use <b>Revert</b> in the file bar to go back to the manual's version.</p>
        </div>
      </div>
    </div>
  );
}
