import { useCallback, useEffect, useMemo, useRef, useState } from 'react';
import { BenchController, BenchState, SPEEDS } from '../bench/controller';
import { EXPERIMENTS, Experiment, Program, PLAYGROUND_ASM, PLAYGROUND_C, findProgram } from '../content/experiments';
import { clearSaved, editedSet, loadSaved, pref, save, setPref } from '../bench/storage';
import { href } from '../bench/router';
import { emptyWiring, Wiring } from '../sim/board/wiring';
import { CodeEditor } from './Editor';
import { BoardView, sameWiring } from './BoardView';
import { CpuView } from './CpuView';
import { Console, DockTab } from './Console';
import {
  IBuild, ICheck, IClose, ICopy, IDownload, IError, IInfo, IPanel, IPause, IPlay, IPlug, IPlus, IReset, IStepInto, IStepOut, IStepOver, IStop, IUndo, IWarn,
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
  const [wiring, setWiringState] = useState<Wiring>(prog?.wiring ?? emptyWiring());
  const [pressed, setPressed] = useState<Set<number>>(new Set());
  const [sw2, setSw2] = useState(false);
  const [pots, setPots] = useState<number[]>([1.65, 1.2]);
  const [dockTab, setDockTab] = useState<DockTab>('problems');
  const [dockH, setDockH] = useState<number>(() => pref('dockH', 230));
  const [railOpen, setRailOpen] = useState(false);
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
    const w = prog?.wiring ?? emptyWiring();
    setWiringState(w);
    setPressed(new Set());
    ctl.load(lang, f, mainFile, w, prog?.speed ?? 1);
    setDockTab(lang === 'asm' ? 'problems' : prog?.terminal !== undefined ? 'serial' : prog?.scope ? 'scope' : 'problems');
    setMtab('code');
    setRailOpen(false);
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
  const buildRun = useCallback(() => {
    audio.resume();
    setBuiltFrom(JSON.stringify(ctl.files));
    ctl.buildAndRun();
  }, [ctl]);
  const run = useCallback(() => {
    audio.resume();
    const key = JSON.stringify(ctl.files);
    if (builtFrom !== key || ctl.state.status === 'idle' || ctl.state.status === 'error' || ctl.state.status === 'halted') { setBuiltFrom(key); ctl.buildAndRun(); }
    else ctl.run();
  }, [ctl, builtFrom]);
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

  const setWiring = (w: Wiring) => { setWiringState(w); ctl.setWiring(w); };
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
    if (!confirm('Discard your changes and restore the manual\'s version of this program?')) return;
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
  const wiredOk = !prog?.wiring || sameWiring(wiring, prog.wiring);
  const allProgs = exp ? [...exp.programs, ...exp.exercises] : [];

  return (
    <div className={'wb' + (railOpen ? ' rail-open' : '')} data-mtab={mtab}>
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
            <nav className="plist" aria-label="Programs">
              <h2><span>Programs</span><span>{exp.programs.length}</span></h2>
              {exp.programs.map(p => (
                <a key={p.id} href={href.exp(exp.no, p.id)} aria-current={p.id === prog?.id ? 'page' : undefined} onClick={() => setRailOpen(false)}>
                  <span className="id">P{p.no}</span><span>{p.title}</span>
                  {edited.has(`e${exp.no}-${p.id}`) && <span className="edited" title="You have edited this program" />}
                </a>
              ))}
              <h2><span>Exercises · solved</span><span>{exp.exercises.length}</span></h2>
              {exp.exercises.map(p => (
                <a key={p.id} href={href.exp(exp.no, p.id)} aria-current={p.id === prog?.id ? 'page' : undefined} onClick={() => setRailOpen(false)}>
                  <span className="id">E{p.no}</span><span>{p.title}</span>
                  {edited.has(`e${exp.no}-${p.id}`) && <span className="edited" title="You have edited this program" />}
                </a>
              ))}
            </nav>
            {prog && <Brief prog={prog} wiredOk={wiredOk} onWire={() => prog.wiring && setWiring(prog.wiring)} />}
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
          <button className="btn icon ghost" title="Show the experiment list" onClick={() => setRailOpen(o => !o)} style={{ display: 'none' }} data-rail-toggle><IPanel /></button>
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

      {/* ---------------- bench ---------------- */}
      <section className="bench-col" aria-label={lang === 'c' ? 'Board' : 'CPU'}>
        <div className="panel-head">
          <h3>{lang === 'c' ? 'ALS LPC1768 trainer' : 'ARM7TDMI core'}</h3>
          <span className="grow" />
          {lang === 'c' && <span className="meta">t = {fmtTime(st.simNs)}{st.snapshot && st.snapshot.irqCount ? ` · ${st.snapshot.irqCount} IRQ` : ''}</span>}
          {lang === 'asm' && st.asm && <span className="meta">PC 0x{(st.asm.regs[15] >>> 0).toString(16).toUpperCase().padStart(8, '0')}</span>}
        </div>
        {lang === 'c' ? (
          <>
            {prog?.wiring && !wiredOk && (
              <div className="hints"><div className="hint"><IPlug /><span>The board is not wired the way this program expects. <a href="#" onClick={e => { e.preventDefault(); setWiring(prog.wiring!); }}>Wire as in the manual</a></span></div></div>
            )}
            <BoardView
              snap={st.snapshot}
              wiring={wiring}
              recommended={prog?.wiring}
              devices={prog?.devices}
              pressed={pressed}
              sw2={sw2}
              pots={pots}
              onWiring={setWiring}
              onKey={(k, d) => { setPressed(p => { const n = new Set(p); if (d) n.add(k); else n.delete(k); return n; }); ctl.pressKey(k, d); }}
              onSw2={d => { setSw2(d); ctl.setSw2(d); }}
              onPot={(i, v) => { setPots(p => { const n = [...p]; n[i] = v; return n; }); ctl.setPot(i, v); }}
            />
          </>
        ) : (
          <CpuView asm={st.asm} watch={prog?.watch} />
        )}
      </section>
      {toast && <div className="toast" role="status">{toast}</div>}
    </div>
  );
}

function Brief({ prog, wiredOk, onWire }: { prog: Program; wiredOk: boolean; onWire: () => void }) {
  return (
    <div className="brief">
      {prog.kind === 'exercise' && <><h3>Question</h3><p>{prog.question}</p></>}
      {prog.algorithm && <><h3>Algorithm</h3><ol>{prog.algorithm.map((a, i) => <li key={i}>{a}</li>)}</ol></>}
      {prog.connections && (
        <>
          <h3>Connections</h3>
          <div className="wire-box">
            <ul>{prog.connections.map((c, i) => <li key={i}>{c}</li>)}</ul>
            {prog.wiring && (
              <div className="row">
                <span className={'wire-state ' + (wiredOk ? 'ok' : 'bad')}>{wiredOk ? <><ICheck />Board wired</> : <><IWarn />Not wired yet</>}</span>
                {!wiredOk && <button className="btn sm" onClick={onWire}><IPlug />Wire it</button>}
              </div>
            )}
          </div>
        </>
      )}
      {!prog.connections && prog.wiring && Object.keys(prog.wiring.cables).length > 0 && (
        <>
          <h3>Connections</h3>
          <div className="wire-box">
            <ul>{Object.entries(prog.wiring.cables).map(([h, s]) => <li key={h}>FRC cable {h} → {s}</li>)}{prog.wiring.jumpers.JP5 === false && <li>Open JP5</li>}</ul>
            <div className="row">
              <span className={'wire-state ' + (wiredOk ? 'ok' : 'bad')}>{wiredOk ? <><ICheck />Board wired</> : <><IWarn />Not wired yet</>}</span>
              {!wiredOk && <button className="btn sm" onClick={onWire}><IPlug />Wire it</button>}
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
