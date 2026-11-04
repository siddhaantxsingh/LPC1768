import { useEffect, useRef, useState } from 'react';
import type { BenchController, BenchState } from '../bench/controller';
import type { Lang, Program } from '../content/experiments';
import { Scope } from './Scope';
import { ICheck, IError, IWarn, ITrash } from './icons';
import { disasm } from '../sim/arm/assembler';
import { hex8 } from '../sim/arm/cpu';

export type DockTab = 'problems' | 'output' | 'serial' | 'scope' | 'vars' | 'listing';

interface Props {
  ctl: BenchController;
  st: BenchState;
  lang: Lang;
  prog?: Program;
  tab: DockTab;
  setTab: (t: DockTab) => void;
  onJump: (file: string, line: number) => void;
}

export function Console({ ctl, st, lang, prog, tab, setTab, onJump }: Props) {
  const errs = st.diagnostics.filter(d => d.severity === 'error').length;
  const warns = st.diagnostics.length - errs;
  const tabs: [DockTab, string, JSX.Element | null][] = lang === 'c'
    ? [
      ['problems', 'Problems', errs ? <span className="count err">{errs}</span> : warns ? <span className="count warn">{warns}</span> : null],
      ['scope', 'Scope', null],
      ['serial', 'Serial', st.uart.some(u => u.length) ? <span className="count">{st.uart.reduce((a, u) => a + u.length, 0)}</span> : null],
      ['output', 'printf', st.stdout.length ? <span className="count">{st.stdout.split('\n').length}</span> : null],
      ['vars', 'Variables', null],
    ]
    : [
      ['problems', 'Problems', errs ? <span className="count err">{errs}</span> : warns ? <span className="count warn">{warns}</span> : null],
      ['listing', 'Listing', null],
    ];
  return (
    <>
      <div className="dock-tabs" role="tablist">
        {tabs.map(([id, label, badge]) => (
          <button key={id} role="tab" aria-selected={tab === id} onClick={() => setTab(id)}>{label}{badge}</button>
        ))}
        <span className="grow" />
        {st.buildMs > 0 && <span className="muted mono" style={{ fontSize: 11.5, paddingRight: 6 }}>{lang === 'c' ? 'compiled' : 'assembled'} in {st.buildMs.toFixed(0)} ms{st.stats ? ` · ${st.stats.code} B code` : ''}</span>}
      </div>
      <div className="dock-body">
        {tab === 'problems' && <Problems st={st} onJump={onJump} />}
        {tab === 'output' && <pre className="termout">{st.stdout || <span className="muted">printf() output appears here.</span>}</pre>}
        {tab === 'serial' && <Serial ctl={ctl} st={st} initial={prog?.terminal ?? 3} />}
        {tab === 'scope' && <Scope board={ctl.board} running={st.status === 'running'} defaults={prog?.scope} />}
        {tab === 'vars' && <Vars ctl={ctl} st={st} />}
        {tab === 'listing' && <Listing st={st} />}
      </div>
    </>
  );
}

function Problems({ st, onJump }: { st: BenchState; onJump: (f: string, l: number) => void }) {
  if (!st.diagnostics.length) {
    return <div className="empty">{st.buildMs > 0 ? <><ICheck />No problems. </> : 'Build the program to check it for errors.'}</div>;
  }
  return (
    <ul className="problems">
      {st.diagnostics.map((d, i) => (
        <li key={i} className={d.severity} onClick={() => onJump(d.file, d.line)}>
          {d.severity === 'error' ? <IError /> : <IWarn />}
          <span className="loc">{d.file.replace(/^<|>$/g, '')}:{d.line}</span>
          <span>{d.msg}</span>
        </li>
      ))}
    </ul>
  );
}

function Serial({ ctl, st, initial }: { ctl: BenchController; st: BenchState; initial: number }) {
  const [port, setPort] = useState(initial);
  const [line, setLine] = useState('');
  const [mode, setMode] = useState<'char' | 'line'>('char');
  const out = useRef<HTMLPreElement>(null);
  useEffect(() => { setPort(initial); }, [initial]);
  useEffect(() => { const o = out.current; if (o) o.scrollTop = o.scrollHeight; }, [st.uart[port]]);
  const send = (text: string) => ctl.sendUart(port, text);
  return (
    <div className="term">
      <pre className="termout" ref={out}>{st.uart[port] || <span className="muted">UART{port} output appears here. Type below to send characters to the board.</span>}{st.status === 'running' && <span className="cursor-blink" />}</pre>
      <div className="term-in">
        <div className="seg-ctl" role="group" aria-label="UART">
          {[0, 2, 3].map(u => <button key={u} aria-pressed={port === u} onClick={() => setPort(u)}>UART{u}</button>)}
        </div>
        <input
          value={line}
          placeholder={mode === 'char' ? 'Type — each key is sent immediately' : 'Type a line, Enter to send'}
          onChange={e => {
            const v = e.target.value;
            if (mode === 'char') { if (v.length > line.length) send(v.slice(line.length)); setLine(v.slice(-40)); }
            else setLine(v);
          }}
          onKeyDown={e => {
            if (e.key === 'Enter') { if (mode === 'line') send(line + '\r'); else send('\r'); setLine(''); }
          }}
          aria-label="Send to UART"
          spellCheck={false}
        />
        <div className="seg-ctl" role="group" aria-label="Send mode">
          <button aria-pressed={mode === 'char'} onClick={() => setMode('char')}>char</button>
          <button aria-pressed={mode === 'line'} onClick={() => setMode('line')}>line</button>
        </div>
        <button className="btn sm ghost icon" title="Clear" onClick={() => ctl.clearUart(port)}><ITrash /></button>
      </div>
    </div>
  );
}

function Vars({ ctl, st }: { ctl: BenchController; st: BenchState }) {
  const [rows, setRows] = useState(() => ctl.watch());
  const prev = useRef(new Map<string, string>());
  const [changed, setChanged] = useState<Set<string>>(new Set());
  useEffect(() => {
    const id = setInterval(() => {
      const r = ctl.watch();
      const ch = new Set<string>();
      for (const x of r) { if (prev.current.has(x.name) && prev.current.get(x.name) !== x.value) ch.add(x.name); prev.current.set(x.name, x.value); }
      setRows(r);
      setChanged(ch);
    }, st.status === 'running' ? 150 : 400);
    return () => clearInterval(id);
  }, [ctl, st.status, st.version]);
  if (!rows.length) return <div className="empty">{ctl.session ? 'This program has no global variables.' : 'Build the program to see its global variables.'}</div>;
  return (
    <table className="watch">
      <thead><tr><th>Name</th><th>Type</th><th>Value</th></tr></thead>
      <tbody>
        {rows.map(r => (
          <tr key={r.name} className={changed.has(r.name) ? 'flash' : ''}><td className="n">{r.name}</td><td className="t">{r.type}</td><td className="v">{r.value}</td></tr>
        ))}
      </tbody>
    </table>
  );
}

function Listing({ st }: { st: BenchState }) {
  const a = st.asm;
  if (!a) return <div className="empty">Assemble the program to see the address, machine code and disassembly of every line.</div>;
  const pc = a.regs[15];
  return (
    <table className="listing">
      <tbody>
        {a.prog.listing.map((l, i) => (
          <tr key={i} className={l.kind === 'instr' && l.addr === pc ? 'cur' : ''}>
            <td className="a">{hex8(l.addr)}</td>
            <td className="w">{l.word !== undefined ? hex8(l.word) : ''}</td>
            <td>{l.instr ? disasm(l.instr) : l.kind === 'pool' ? <span className="muted">DCD 0x{hex8(l.word ?? 0)} ; literal pool</span> : <span className="muted">{l.text.trim()}</span>}</td>
            <td className="l">{l.line ? `line ${l.line}` : ''}</td>
          </tr>
        ))}
      </tbody>
    </table>
  );
}
