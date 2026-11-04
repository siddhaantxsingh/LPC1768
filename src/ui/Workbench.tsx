import { useCallback, useEffect, useMemo, useRef, useState } from 'react';
import { BenchController, BenchState, SPEEDS } from '../bench/controller';
import { EXPERIMENTS, Experiment, Program, PLAYGROUND_ASM, PLAYGROUND_C, findProgram, requirementFor } from '../content/experiments';
import { clearSaved, editedSet, loadSaved, pref, save, setPref } from '../bench/storage';
import { href } from '../bench/router';
import { applyRequirement, emptyWiring, missing, Requirement, Wiring } from '../sim/board/wiring';
import { CodeEditor } from './Editor';
import { TrainerBoard, BoardStage } from './TrainerBoard';
import { MotorBench, MW, MH } from './MotorBench';
import { Scope } from './Scope';
import { CpuView } from './CpuView';
import { Console, DockTab } from './Console';
import {
  ICheck, IClose, ICopy, IDownload, IError, IFocus, IInfo, IPanel, IPause, IPlay, IPlug, IPlus, IReset, IStepInto, IStepOut, IStepOver, IStop, IUndo, IWarn, ITrash, IChevron,
} from './icons';
import { audio } from '../bench/audio';

interface Props { expNo?: number; progId?: string; playground?: 'c' | 'asm' }

function useController(): BenchController {
  const ref = useRef<BenchController | null>(null);
  if (!ref.current) ref.current = new BenchController();
  useEffect(() => () => ref.current?.dispose(), []);
  return ref.current;
}

function useBenchState(ctl: BenchController): BenchState {
  const [st, setSt] = useState(ctl.state);
  useEffect(() => ctl.subscribe(setSt), [ctl]);
  return st;
}

export function Workbench({ expNo, progId, playground }: Props) {
  const found = expNo ? findProgram(expNo, progId ?? 'p1') ?? findProgram(expNo, 'p1') : null;
  const exp: Experiment | null = found?.exp ?? null;
  const prog: Program | null = found?.prog ?? null;
  const lang = playground ?? prog?.lang ?? 'c';
  const storeId = playground ? `play-${playground}` : `e${exp?.no}-${prog?.id}`;
  const original: Record<string, string> = useMemo(() => playground
    ? (playground === 'c' ? { 'main.c': PLAYGROUND_C } : { 'main.s': PLAYGROUND_ASM })
    : prog?.files ?? { 'main.c': '' }, [playground, prog]);
  const mainFile = playground ? (playground === 'c' ? 'main.c' : 'main.s') : prog?.main ?? 'main.c';

  const ctl = useController();
  const st = useBenchState(ctl);
  // read-only handle for automated end-to-end tests
  useEffect(() => { (window as any).__bench = ctl; }, [ctl]);
  const [files, setFiles] = useState<Record<string, string>>(original);
  const [active, setActive] = useState(mainFile);
  const [bps, setBps] = useState<Record<string, Set<number>>>({});
  // the bench keeps its cables between programs, like a real trainer on a lab desk
  const [wiring, setWiringState] = useState<Wiring>(() => {
    const w = pref<Wiring | null>('wiring', null);
    const base = emptyWiring();
    return w ? { cables: w.cables ?? {}, jumpers: { ...base.jumpers, ...(w.jumpers ?? {}) } } : base;
  });
  const wiringRef = useRef(wiring);
  wiringRef.current = wiring;
  const requirement: Requirement | null = prog ? requirementFor(prog) : null;
  const missingNow = requirement ? missing(wiring, requirement) : [];
  const [zoom, setZoom] = useState<'fit' | number>('fit');
  const [boardMax, setBoardMax] = useState(false);
  const [showReq, setShowReq] = useState(true);
  const [connOpen, setConnOpen] = useState(false);
  const [split, setSplit] = useState<number>(() => pref('split', 0.42));
  const [warnRun, setWarnRun] = useState<string[] | null>(null);
  const [showMotors, setShowMotors] = useState<boolean>(() => pref('motors', true));
  const needsScope = !!prog && (!!prog.scope || !!prog.devices?.some(d => d === 'scope' || d === 'dac'));
  const [scopeOn, setScopeOn] = useState<boolean>(needsScope);
  useEffect(() => { setScopeOn(needsScope); }, [needsScope, storeId]);
  // the connections menu closes on any click outside it, or Esc
  useEffect(() => {
    if (!connOpen) return;
    const down = (e: MouseEvent) => { if (!(e.target as HTMLElement).closest?.('.conn-menu')) setConnOpen(false); };
    const key = (e: KeyboardEvent) => { if (e.key === 'Escape') setConnOpen(false); };
    window.addEventListener('mousedown', down);
    window.addEventListener('keydown', key);
    return () => { window.removeEventListener('mousedown', down); window.removeEventListener('keydown', key); };
  }, [connOpen]);
  const [pressed, setPressed] = useState<Set<number>>(new Set());
  const [sw2, setSw2] = useState(false);
  const [pots, setPots] = useState<number[]>([1.65, 1.2]);
  const [dockTab, setDockTab] = useState<DockTab>('problems');
  const [dockH, setDockH] = useState<number>(() => pref('dockH', 230));
  const [railOpen, setRailOpen] = useState(() => (playground ?? prog?.lang) === 'asm' ? pref('railAsm', true) : pref('railC', false));
  const [mtab, setMtab] = useState<'brief' | 'code' | 'board'>('code');
  const [builtFrom, setBuiltFrom] = useState<string | null>(null);
  const [toast, setToast] = useState<string | null>(null);
  const [reveal, setReveal] = useState<{ line: number; n: number } | null>(null);
  const [edited, setEdited] = useState<Set<string>>(() => editedSet());
  const [animate, setAnimate] = useState(false);

  const filesKey = JSON.stringify(files);
  const dirty = builtFrom !== null && builtFrom !== filesKey;
  const isEdited = filesKey !== JSON.stringify(original);

  // load program
  useEffect(() => {
    const saved = loadSaved(storeId);
    const f = saved?.files && Object.keys(saved.files).length ? saved.files : original;
    setFiles(f);
    setActive(mainFile);
    setBps({});
    setBuiltFrom(null);
    setPressed(new Set());
    setWarnRun(null);
    ctl.load(lang, f, mainFile, wiringRef.current, prog?.speed ?? 1);
    setDockTab(lang === 'asm' ? 'problems' : prog?.terminal !== undefined ? 'serial' : 'problems');
    setMtab('code');
    // the docked panel keeps its saved state; the tablet drawer always closes after navigating
    setRailOpen(window.matchMedia('(max-width: 1080px)').matches ? false : lang === 'asm' ? pref('railAsm', true) : pref('railC', false));
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [storeId]);

  // persist edits
  useEffect(() => {
    ctl.updateFiles(files);
    const t = setTimeout(() => {
      if (isEdited) { save(storeId, files); setEdited(s => new Set(s).add(storeId)); }
      else { clearSaved(storeId); setEdited(s => { const n = new Set(s); n.delete(storeId); return n; }); }
    }, 350);
    return () => clearTimeout(t);
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [filesKey]);

  useEffect(() => { ctl.setAsmAnimate(animate); }, [animate, ctl]);

  const flash = (m: string) => { setToast(m); setTimeout(() => setToast(t => (t === m ? null : t)), 1800); };

  // ---------- commands ----------
  const preRun = () => {
    if (lang !== 'c') return;
    const req = prog ? requirementFor(prog) : null;
    const miss = req ? missing(wiringRef.current, req) : [];
    setWarnRun(miss.length ? miss : null);
    if (window.matchMedia('(max-width: 820px)').matches) setMtab('board');
  };
  const buildRun = useCallback(() => {
    preRun();
    audio.resume();
    setBuiltFrom(JSON.stringify(ctl.files));
    ctl.buildAndRun();
  // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [ctl, prog]);
  const run = useCallback(() => {
    preRun();
    audio.resume();
    const key = JSON.stringify(ctl.files);
    if (builtFrom !== key || ctl.state.status === 'idle' || ctl.state.status === 'error' || ctl.state.status === 'halted') { setBuiltFrom(key); ctl.buildAndRun(); }
    else ctl.run();
  // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [ctl, builtFrom, prog]);
  const step = useCallback((mode: 1 | 2 | 3) => {
    const key = JSON.stringify(ctl.files);
    if (builtFrom !== key || ctl.state.status === 'idle' || ctl.state.status === 'error') { setBuiltFrom(key); if (!ctl.build()) return; }
    ctl.step(mode);
  }, [ctl, builtFrom]);
  const commands = useMemo(() => ({
    run, buildRun,
    pause: () => ctl.pause(),
    stepOver: () => step(2), stepInto: () => step(1), stepOut: () => step(3),
    reset: () => ctl.reset(),
    save: () => { save(storeId, files); flash('Saved in this browser'); },
  }), [run, buildRun, step, ctl, storeId, files]);

  // jump to file on pause (e.g. stepping into lcd.c)
  useEffect(() => {
    if (st.status === 'paused' && st.loc && files[st.loc.file] !== undefined && st.loc.file !== active) setActive(st.loc.file);
    if (st.status === 'error' && st.errorLine && files[st.errorLine.file] !== undefined && st.errorLine.file !== active) setActive(st.errorLine.file);
    if (st.status === 'error' && st.diagnostics.some(d => d.severity === 'error')) setDockTab(t => (t === 'scope' || t === 'serial' ? t : 'problems'));
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [st.status, st.loc?.file, st.loc?.line, st.errorLine?.line]);

  // keyboard: keypad + SW2 (when not typing)
  useEffect(() => {
    if (lang !== 'c') return;
    const typing = (e: KeyboardEvent) => {
      const el = e.target as HTMLElement;
      return !!el?.closest?.('.cm-editor, input, textarea, select, [contenteditable]');
    };
    const keyOf = (e: KeyboardEvent) => { const k = e.key.toLowerCase(); return /^[0-9a-f]$/.test(k) && !e.ctrlKey && !e.metaKey && !e.altKey ? parseInt(k, 16) : -1; };
    const down = (e: KeyboardEvent) => {
      if (typing(e) || e.repeat) return;
      if (e.key === ' ' && !(e.target as HTMLElement)?.closest?.('button')) { e.preventDefault(); setSw2(true); ctl.setSw2(true); return; }
      const k = keyOf(e);
      if (k >= 0) { setPressed(p => new Set(p).add(k)); ctl.pressKey(k, true); }
      if (e.key === 'F5') { e.preventDefault(); commands.run(); }
      if (e.key === 'F6') { e.preventDefault(); commands.pause(); }
      if (e.key === 'F10') { e.preventDefault(); commands.stepOver(); }
      if (e.key === 'F11') { e.preventDefault(); e.shiftKey ? commands.stepOut() : commands.stepInto(); }
    };
    const up = (e: KeyboardEvent) => {
      if (e.key === ' ') { setSw2(false); ctl.setSw2(false); return; }
      const k = keyOf(e);
      if (k >= 0) { setPressed(p => { const n = new Set(p); n.delete(k); return n; }); ctl.pressKey(k, false); }
    };
    const blur = () => { setPressed(new Set()); for (let k = 0; k < 16; k++) ctl.pressKey(k, false); setSw2(false); ctl.setSw2(false); };
    window.addEventListener('keydown', down);
    window.addEventListener('keyup', up);
    window.addEventListener('blur', blur);
    return () => { window.removeEventListener('keydown', down); window.removeEventListener('keyup', up); window.removeEventListener('blur', blur); };
  }, [ctl, lang, commands]);

  const setWiring = (w: Wiring) => {
    setWiringState(w); ctl.setWiring(w); setPref('wiring', w);
    if (requirement && !missing(w, requirement).length) setWarnRun(null);
  };
  const connectForMe = () => { if (requirement) { setWiring(applyRequirement(wiring, requirement)); flash('Connected as the manual says'); } };
  const clearCables = () => setWiring({ ...wiring, cables: {} });
  const toggleRail = () => setRailOpen(o => { const n = !o; setPref(lang === 'asm' ? 'railAsm' : 'railC', n); return n; });

  // ---------- code | board splitter ----------
  const wbRef = useRef<HTMLDivElement>(null);
  const splitDrag = useRef(false);
  const onSplitDown = (e: React.PointerEvent) => { (e.target as HTMLElement).setPointerCapture(e.pointerId); splitDrag.current = true; };
  const onSplitMove = (e: React.PointerEvent) => {
    if (!splitDrag.current || !wbRef.current) return;
    const r = wbRef.current.getBoundingClientRect();
    const left = r.left + (railOpen ? 280 : 0);
    const f = (e.clientX - left) / (r.right - left);
    setSplit(Math.max(0.22, Math.min(0.72, f)));
  };
  const onSplitUp = () => { splitDrag.current = false; setPref('split', split); };
  const toggleBp = (line: number) => {
    setBps(prev => {
      const cur = new Set(prev[active] ?? []);
      if (cur.has(line)) cur.delete(line); else cur.add(line);
      ctl.setBreakpoints(active, cur);
      return { ...prev, [active]: cur };
    });
  };

  const onJump = (file: string, line: number) => {
    if (files[file] !== undefined) setActive(file);
    setReveal({ line, n: Date.now() });
    setMtab('code');
  };

  // ---------- file ops ----------
  const addFile = () => {
    const name = prompt('New file name (e.g. delay.c or delay.h):', lang === 'c' ? 'new.c' : 'new.s');
    if (!name) return;
    if (!/^[\w.-]+\.(c|h|s)$/i.test(name)) { flash('Use a name ending in .c or .h'); return; }
    if (files[name] !== undefined) { setActive(name); return; }
    setFiles(f => ({ ...f, [name]: name.endsWith('.h') ? `#ifndef ${name.replace(/\W/g, '_').toUpperCase()}\n#define ${name.replace(/\W/g, '_').toUpperCase()}\n\n#endif\n` : '#include <LPC17xx.h>\n\n' }));
    setActive(name);
  };
  const removeFile = (name: string) => {
    if (name === mainFile) return;
    if (!confirm(`Remove ${name} from this project?`)) return;
    setFiles(f => { const n = { ...f }; delete n[name]; return n; });
    if (active === name) setActive(mainFile);
  };
  const revert = () => {
    if (!confirm('Discard your changes and restore the manual\'s version of this example?')) return;
    clearSaved(storeId);
    setFiles(original);
    setActive(mainFile);
    flash('Restored the manual version');
  };
  const download = () => {
    const blob = new Blob([files[active] ?? ''], { type: 'text/plain' });
    const a = document.createElement('a');
    a.href = URL.createObjectURL(blob);
    a.download = playground ? active : `exp${exp?.no}_${prog?.id}_${active}`;
    a.click();
    URL.revokeObjectURL(a.href);
  };
  const copy = async () => {
    try { await navigator.clipboard.writeText(files[active] ?? ''); flash('Copied to clipboard'); } catch { flash('Copy failed — select the text manually'); }
  };

  // ---------- dock resize ----------
  const dragRef = useRef<{ y: number; h: number } | null>(null);
  const [dragging, setDragging] = useState(false);
  const onResizeDown = (e: React.PointerEvent) => {
    (e.target as HTMLElement).setPointerCapture(e.pointerId);
    dragRef.current = { y: e.clientY, h: dockH };
    setDragging(true);
  };
  const onResizeMove = (e: React.PointerEvent) => {
    if (!dragRef.current) return;
    const h = Math.max(120, Math.min(window.innerHeight * 0.7, dragRef.current.h + dragRef.current.y - e.clientY));
    setDockH(h);
  };
  const onResizeUp = () => { dragRef.current = null; setDragging(false); setPref('dockH', dockH); };

  const running = st.status === 'running';
  const paused = st.status === 'paused';
  const execLine = st.loc && st.loc.file === active && (paused || st.status === 'error' || (lang === 'asm' && st.status === 'halted')) ? st.loc.line : null;
  const errorLine = st.errorLine && st.errorLine.file === active ? st.errorLine.line : null;
  const fileDiags = st.diagnostics.filter(d => d.file === active);
  const wiredOk = missingNow.length === 0;
  const allProgs = exp ? [...exp.programs, ...exp.exercises] : [];

  return (
    <div ref={wbRef} className={'wb' + (railOpen ? ' rail-open' : ' rail-closed') + (boardMax ? ' board-max' : '') + (lang === 'asm' ? ' is-asm' : ' is-c')} data-mtab={mtab}
      style={{ ['--cols' as any]: boardMax ? `${railOpen ? '280px' : '0px'} 0px 0px minmax(0, 1fr)` : `${railOpen ? '280px' : '0px'} minmax(320px, ${split}fr) 7px minmax(380px, ${1 - split}fr)` }}>
      <div className="mtabs" role="tablist">
        <button role="tab" aria-selected={mtab === 'brief'} onClick={() => setMtab('brief')}>Manual</button>
        <button role="tab" aria-selected={mtab === 'code'} onClick={() => setMtab('code')}>Code</button>
        <button role="tab" aria-selected={mtab === 'board'} onClick={() => setMtab('board')}>{lang === 'c' ? 'Board' : 'CPU'}</button>
      </div>

      {/* ---------------- rail ---------------- */}
      <aside className="rail" aria-label="Experiment">
        {exp ? (
          <>
            <div className="rail-head">
              <div className="k">Experiment {String(exp.no).padStart(2, '0')} · {exp.lang === 'asm' ? 'ARM7 assembly' : 'LPC1768 · C'}</div>
              <h1>{exp.short}</h1>
              <p className="aim"><b>Aim.</b> {exp.aim}</p>
            </div>
            <nav className="plist" aria-label="Examples and exercises">
              <h2><span>Examples</span><span>{exp.programs.length}</span></h2>
              {exp.programs.map(p => (
                <a key={p.id} href={href.exp(exp.no, p.id)} aria-current={p.id === prog?.id ? 'page' : undefined} onClick={() => { if (window.matchMedia('(max-width: 1080px)').matches) setRailOpen(false); }}>
                  <span className="id">P{p.no}</span><span>{p.title}</span>
                  {edited.has(`e${exp.no}-${p.id}`) && <span className="edited" title="You have edited this example" />}
                </a>
              ))}
              <h2><span>Exercises · solved</span><span>{exp.exercises.length}</span></h2>
              {exp.exercises.map(p => (
                <a key={p.id} href={href.exp(exp.no, p.id)} aria-current={p.id === prog?.id ? 'page' : undefined} onClick={() => { if (window.matchMedia('(max-width: 1080px)').matches) setRailOpen(false); }}>
                  <span className="id">E{p.no}</span><span>{p.title}</span>
                  {edited.has(`e${exp.no}-${p.id}`) && <span className="edited" title="You have edited this example" />}
                </a>
              ))}
            </nav>
            {prog && <Brief prog={prog} requirement={requirement} missingNow={missingNow} onWire={connectForMe} />}
            <div className="credit-rail">made by <b>Siddhant Singh</b></div>
          </>
        ) : (
          <div className="rail-head">
            <div className="k">Scratchpad</div>
            <h1>{lang === 'c' ? 'Blank C project' : 'Blank assembly file'}</h1>
            <p className="aim">Write anything. Edits are saved in this browser. {lang === 'c' ? 'Every cable starts unplugged; wire the board from the Board panel.' : 'Programs start at ENTRY and should end in an infinite loop such as STOP B STOP.'}</p>
            <div className="brief" style={{ border: 0, padding: '14px 0 0' }}>
              <h3>Jump to an experiment</h3>
              <ul>{EXPERIMENTS.filter(e => e.lang === lang).map(e => <li key={e.no}><a href={href.exp(e.no)}>Exp {e.no} · {e.short}</a></li>)}</ul>
            </div>
          </div>
        )}
      </aside>

      {/* ---------------- center ---------------- */}
      <section className="center" aria-label="Code">
        {prog && (
          <div className="prog-head">
            <span className="badge">{prog.kind === 'program' ? 'P' : 'E'}{prog.no}</span>
            <h2>{prog.title}</h2>
            <p>{prog.question}</p>
          </div>
        )}
        <div className="toolbar" onMouseDown={e => { if ((e.target as HTMLElement).closest('button')) e.preventDefault(); }}>
          <button className="btn icon ghost rail-btn" title={railOpen ? 'Hide the manual panel' : 'Show the manual panel (examples, exercises, algorithm, connections)'} aria-pressed={railOpen} onClick={toggleRail} data-rail-toggle><IPanel /></button>
          {running
            ? <button className="btn" onClick={commands.pause} title="Pause (F6)"><IPause />Pause</button>
            : <button className="btn primary" onClick={commands.run} title={`${dirty || !builtFrom ? 'Build and run' : 'Continue'} (F5)`}><IPlay />{paused && !dirty && builtFrom ? 'Continue' : lang === 'c' ? 'Build & run' : 'Assemble & run'}</button>}
          <button className="btn icon" onClick={() => commands.stepOver()} disabled={running} title="Step over (F10)"><IStepOver /></button>
          <button className="btn icon" onClick={() => commands.stepInto()} disabled={running} title="Step into (F11)"><IStepInto /></button>
          {lang === 'c' && <button className="btn icon" onClick={() => commands.stepOut()} disabled={running} title="Step out (Shift F11)"><IStepOut /></button>}
          <button className="btn icon" onClick={commands.reset} title="Reset the board (Ctrl Shift R)"><IReset /></button>
          {(running || paused) && lang === 'c' && <button className="btn icon" onClick={() => ctl.stop()} title="Stop"><IStop /></button>}
          <span className="divider hide-sm" />
          {lang === 'c'
            ? <SpeedMenu speed={st.speed} onSpeed={s => ctl.setSpeed(s)} realtime={st.realtime} running={running} />
            : <div className="seg-ctl hide-sm" role="group" aria-label="Run mode"><button aria-pressed={!animate} onClick={() => setAnimate(false)} title="Run to the end at once">Instant</button><button aria-pressed={animate} onClick={() => setAnimate(true)} title="Run one instruction at a time so you can watch the registers">Slow</button></div>}
          <span className="grow" />
          {dirty && !running && <span className="muted hide-sm" style={{ fontSize: 12 }} title="The code changed since the last build">edited · rebuild</span>}
          <StatusPill st={st} lang={lang} />
        </div>
        <div className="files" role="tablist" aria-label="Files">
          {Object.keys(files).sort((a, b) => (a === mainFile ? -1 : b === mainFile ? 1 : a.localeCompare(b))).map(f => (
            <button key={f} role="tab" className="tab" aria-selected={f === active} onClick={() => setActive(f)}>
              {f}
              {f !== mainFile && <span className="x" role="button" aria-label={`Remove ${f}`} onClick={e => { e.stopPropagation(); removeFile(f); }}><IClose /></span>}
            </button>
          ))}
          {lang === 'c' && <button className="add" onClick={addFile} title="Add a file"><IPlus /></button>}
          <div className="meta">
            {isEdited && <button className="btn sm ghost" onClick={revert} title="Restore the manual's version"><IUndo />Revert</button>}
            <button className="btn sm ghost icon" onClick={copy} title="Copy this file"><ICopy /></button>
            <button className="btn sm ghost icon" onClick={download} title="Download this file"><IDownload /></button>
          </div>
        </div>
        <CodeEditor
          value={files[active] ?? ''}
          fileKey={active}
          lang={active.endsWith('.s') ? 'asm' : lang === 'asm' ? 'asm' : 'c'}
          onChange={v => setFiles(f => (f[active] === v ? f : { ...f, [active]: v }))}
          breakpoints={bps[active] ?? new Set()}
          onToggleBreakpoint={toggleBp}
          execLine={execLine}
          errorLine={errorLine}
          diagnostics={fileDiags}
          commands={commands}
          revealLine={reveal}
        />
        {st.message && (
          <div className={'msg-bar ' + (st.status === 'error' ? 'error' : 'info')}>
            {st.status === 'error' ? <IError /> : st.status === 'halted' ? <ICheck /> : <IInfo />}
            <span className="txt">
              {st.message}
              {st.errorLine && st.errorLine.line > 0 && <> {' '}<a onClick={() => onJump(st.errorLine!.file, st.errorLine!.line)}>{st.errorLine.file}:{st.errorLine.line}</a></>}
            </span>
          </div>
        )}
        <div className="dock" style={{ height: dockH, flex: `0 0 ${dockH}px` }}>
          <div className={'dock-resize' + (dragging ? ' drag' : '')} onPointerDown={onResizeDown} onPointerMove={onResizeMove} onPointerUp={onResizeUp} role="separator" aria-orientation="horizontal" aria-label="Resize console" />
          <Console ctl={ctl} st={st} lang={lang} prog={prog ?? undefined} tab={dockTab} setTab={setDockTab} onJump={onJump} />
        </div>
      </section>

      <div className="splitter" role="separator" aria-orientation="vertical" aria-label="Resize code and board" onPointerDown={onSplitDown} onPointerMove={onSplitMove} onPointerUp={onSplitUp} onDoubleClick={() => { setSplit(0.42); setPref('split', 0.42); }} />

      {/* ---------------- bench ---------------- */}
      <section className="bench-col" aria-label={lang === 'c' ? 'Board' : 'CPU'}>
        <div className="panel-head">
          <h3>{lang === 'c' ? 'ALS LPC1768 trainer' : 'ARM7TDMI core'}</h3>
          {lang === 'c' && requirement && (
            <div className="conn-menu">
              <button className={'chip conn-chip' + (wiredOk ? ' on' : ' need')} onClick={() => setConnOpen(o => !o)} aria-expanded={connOpen}>
                {wiredOk ? <ICheck /> : <IWarn />}
                Connections {requirement.cables.length + Object.keys(requirement.jumpers).length - missingNow.length}/{requirement.cables.length + Object.keys(requirement.jumpers).length}
                <IChevron />
              </button>
              {connOpen && (
                <div className="menu conn-pop" onMouseLeave={() => setConnOpen(false)}>
                  <div className="group">Needed for this program</div>
                  <ReqList requirement={requirement} wiring={wiring} />
                  <label className="check" style={{ padding: '8px 10px 4px' }}><input type="checkbox" checked={showReq} onChange={e => setShowReq(e.target.checked)} /> Highlight what is missing on the board</label>
                  <div style={{ display: 'flex', gap: 6, padding: '8px 10px 6px' }}>
                    <button className="btn sm" onClick={() => { connectForMe(); setConnOpen(false); }} disabled={wiredOk}><IPlug />Connect for me</button>
                    <button className="btn sm ghost" onClick={clearCables}><ITrash />Unplug all</button>
                  </div>
                </div>
              )}
            </div>
          )}
          {lang === 'c' && !requirement && <button className="btn sm ghost" onClick={clearCables} title="Remove every ribbon cable"><ITrash />Unplug all</button>}
          <span className="grow" />
          {lang === 'c' && <span className="meta">t = {fmtTime(st.simNs)}{st.snapshot && st.snapshot.irqCount ? ` · ${st.snapshot.irqCount} IRQ` : ''}</span>}
          {lang === 'c' && (
            <div className="seg-ctl" role="group" aria-label="Board zoom">
              <button aria-pressed={zoom === 'fit'} onClick={() => setZoom('fit')} title="Fit the whole board">Fit</button>
              <button aria-pressed={zoom === 1} onClick={() => setZoom(1)} title="Actual size (scroll to move)">100%</button>
            </div>
          )}
          {lang === 'c' && <button className="btn sm ghost" aria-pressed={showMotors} onClick={() => setShowMotors(m => { setPref('motors', !m); return !m; })} title="Show or hide the stepper and DC motor">Motors</button>}
          {lang === 'c' && <button className="btn sm ghost" aria-pressed={scopeOn} onClick={() => setScopeOn(o => !o)} title="Show or hide the oscilloscope under the board">Scope</button>}
          {lang === 'c' && <button className="btn sm ghost icon hide-sm" aria-pressed={boardMax} onClick={() => setBoardMax(m => !m)} title={boardMax ? 'Show the code again' : 'Give the board the whole width'}><IFocus /></button>}
          {lang === 'asm' && st.asm && <span className="meta">PC 0x{(st.asm.regs[15] >>> 0).toString(16).toUpperCase().padStart(8, '0')}</span>}
        </div>
        {lang === 'c' ? (
          <>
            {warnRun && warnRun.length > 0 && (
              <div className="run-warn"><IPlug /><span><b>Not connected:</b> {warnRun.join(' · ')}. The program is running, but those parts won't respond until you connect them.</span>
                <button className="btn sm" onClick={connectForMe}>Connect for me</button><button className="btn sm ghost icon" onClick={() => setWarnRun(null)} aria-label="Dismiss"><IClose /></button></div>
            )}
            <div className="stage-wrap">
              <BoardStage zoom={zoom}>
                <TrainerBoard
                  snap={st.snapshot}
                  wiring={wiring}
                  requirement={requirement}
                  showReq={showReq}
                  running={running}
                  pressed={pressed}
                  sw2={sw2}
                  pots={pots}
                  onWiring={setWiring}
                  onKey={(k, d) => { setPressed(p => { const n = new Set(p); if (d) n.add(k); else n.delete(k); return n; }); ctl.pressKey(k, d); }}
                  onSw2={d => { setSw2(d); ctl.setSw2(d); }}
                  onPot={(i, v) => { setPots(p => { const n = [...p]; n[i] = v; return n; }); ctl.setPot(i, v); }}
                  onReset={() => ctl.reset()}
                />
              </BoardStage>
              {st.snapshot && st.snapshot.hints.length > 0 && (
                <div className="hints floating">
                  {st.snapshot.hints.slice(0, 3).map(h => <div key={h.id} className={'hint' + (h.level === 'info' ? ' info' : '')}>{h.level === 'info' ? <IInfo /> : <IWarn />}<span>{h.msg}</span></div>)}
                </div>
              )}
            </div>
            {showMotors && (
              <div className="motor-wrap">
                <BoardStage zoom="fit" w={MW} h={MH}><MotorBench snap={st.snapshot} connected={Object.values(wiring.cables).includes('CNA5')} /></BoardStage>
              </div>
            )}
            {scopeOn && (
              <div className="bench-scope">
                <Scope board={ctl.board} running={running} defaults={prog?.scope ?? (prog?.devices?.includes('dac') ? { b: 'DAC', tb: 100 } : undefined)} />
              </div>
            )}
          </>
        ) : (
          <CpuView asm={st.asm} watch={prog?.watch} edit={{
            onReg: (i, v) => ctl.setAsmReg(i, v),
            onMem: (a, v) => ctl.setAsmMem(a, v),
            onFlag: f => ctl.toggleAsmFlag(f),
            onClear: () => ctl.clearAsmPresets(),
          }} />
        )}
      </section>
      {toast && <div className="toast" role="status">{toast}</div>}
    </div>
  );
}

function ReqList({ requirement, wiring }: { requirement: Requirement; wiring: Wiring }) {
  const items: [string, boolean][] = [
    ...requirement.cables.map(([h, so]) => [`FRC cable ${h} → ${so}`, wiring.cables[h] === so] as [string, boolean]),
    ...Object.entries(requirement.jumpers).map(([j, v]) => [`${v ? 'Short' : 'Open'} ${j}${j === 'JP18' ? ' (pins 2-3)' : ''}`, !!(wiring.jumpers as any)[j] === v] as [string, boolean]),
  ];
  if (!items.length) return <div className="req-row ok"><ICheck />No cables needed</div>;
  return <>{items.map(([t, ok]) => <div key={t} className={'req-row' + (ok ? ' ok' : '')}>{ok ? <ICheck /> : <span className="req-dot" />}{t}</div>)}</>;
}

function Brief({ prog, requirement, missingNow, onWire }: { prog: Program; requirement: Requirement | null; missingNow: string[]; onWire: () => void }) {
  const wiredOk = missingNow.length === 0;
  return (
    <div className="brief">
      {prog.kind === 'exercise' && <><h3>Question</h3><p>{prog.question}</p></>}
      {prog.algorithm && <><h3>Algorithm</h3><ol>{prog.algorithm.map((a, i) => <li key={i}>{a}</li>)}</ol></>}
      {requirement && (
        <>
          <h3>Connections</h3>
          <div className="wire-box">
            {prog.connections && <ul>{prog.connections.map((c, i) => <li key={i}>{c}</li>)}</ul>}
            <div className="req-list"><ReqList requirement={requirement} wiring={wiringFromReqView(requirement, missingNow)} /></div>
            <div className="row">
              <span className={'wire-state ' + (wiredOk ? 'ok' : 'bad')}>{wiredOk ? <><ICheck />All connected</> : <><IWarn />Connect these on the board</>}</span>
              {!wiredOk && <button className="btn sm ghost" onClick={onWire} title="Plug the cables and set the jumpers for me"><IPlug />Connect for me</button>}
            </div>
          </div>
        </>
      )}
      {prog.output && <><h3>Expected output</h3><div className="callout out">{prog.output}</div></>}
      {prog.tryIt && <><h3>Try it</h3>{prog.tryIt.map((t, i) => <div key={i} className="callout tip">{t}</div>)}</>}
      {prog.notes && <><h3>Notes</h3>{prog.notes.map((n, i) => <div key={i} className="callout note">{n}</div>)}</>}
    </div>
  );
}

/** Rebuild a wiring view from the missing list so ReqList can tick items. */
function wiringFromReqView(r: Requirement, miss: string[]): Wiring {
  const w = emptyWiring();
  for (const [h, so] of r.cables) if (!miss.includes(`${h} → ${so}`)) w.cables[h] = so;
  for (const [j, v] of Object.entries(r.jumpers) as [keyof Wiring['jumpers'], boolean][]) {
    const label = v ? `short ${j}${j === 'JP18' ? ' (2-3)' : ''}` : `open ${j}`;
    (w.jumpers as any)[j] = miss.includes(label) ? !v : v;
  }
  return w;
}

function StatusPill({ st, lang }: { st: BenchState; lang: string }) {
  const label: Record<string, string> = { idle: 'ready', building: 'building', running: 'running', paused: 'paused', halted: lang === 'asm' ? 'finished' : 'stopped', error: 'error' };
  let extra = '';
  if (st.status === 'paused' && st.loc) extra = ` · line ${st.loc.line}`;
  return <span className={'status-pill ' + st.status}><i />{label[st.status]}{extra}</span>;
}

function SpeedMenu({ speed, onSpeed, realtime, running }: { speed: number; onSpeed: (s: number) => void; realtime: number; running: boolean }) {
  const slow = running && realtime < 0.9;
  return (
    <label className="hide-sm" style={{ display: 'inline-flex', alignItems: 'center', gap: 6, fontSize: 12, color: 'var(--muted)' }} title={`Virtual CPU speed: ${2 * speed} million instructions per second. 1× runs the manual's delay loops at a comfortable pace; raise it for timer-paced programs.`}>
      <select className="btn sm speed-btn" value={speed} onChange={e => onSpeed(Number(e.target.value))} aria-label="CPU speed">
        {SPEEDS.map(s => <option key={s} value={s}>{s}× speed</option>)}
      </select>
      {slow && <span style={{ color: 'var(--warn)' }} title="Your device can't keep up with this speed; the simulation is running slower than real time.">{Math.round(realtime * 100)}%</span>}
    </label>
  );
}

function fmtTime(ns: number) {
  const s = ns / 1e9;
  if (s < 1) return (ns / 1e6).toFixed(1) + ' ms';
  if (s < 60) return s.toFixed(2) + ' s';
  return `${Math.floor(s / 60)}:${(s % 60).toFixed(1).padStart(4, '0')}`;
}
