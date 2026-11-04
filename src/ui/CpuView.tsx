import { useMemo, useRef, useState } from 'react';
import { AsmView, parseValue } from '../bench/controller';
import { DATA_BASE } from '../sim/arm/assembler';
import { hex8 } from '../sim/arm/cpu';

const RN = ['R0', 'R1', 'R2', 'R3', 'R4', 'R5', 'R6', 'R7', 'R8', 'R9', 'R10', 'R11', 'R12', 'R13 SP', 'R14 LR', 'R15 PC'];

function HexVal({ v }: { v: number }) {
  const h = hex8(v);
  const lead = h.match(/^0*/)![0].length;
  const keep = Math.min(lead, 7);
  return <span className="rv"><span className="z">{h.slice(0, keep)}</span>{h.slice(keep)}</span>;
}

/** Click-to-edit value: accepts decimal, hex (0x1F), binary (0b101), negative or a character ('A'). */
function Editable({ value, onCommit, children, label, className = '' }: { value: number; onCommit: (v: number) => void; children: React.ReactNode; label: string; className?: string }) {
  const [editing, setEditing] = useState(false);
  const [text, setText] = useState('');
  const [bad, setBad] = useState(false);
  const ref = useRef<HTMLInputElement>(null);
  if (editing) {
    const commit = () => {
      const v = parseValue(text);
      if (v === null) { setBad(true); ref.current?.focus(); return; }
      onCommit(v); setEditing(false);
    };
    return (
      <input ref={ref} className={'edit-in' + (bad ? ' bad' : '')} value={text} autoFocus spellCheck={false} aria-label={label}
        onChange={e => { setText(e.target.value); setBad(false); }}
        onKeyDown={e => { e.stopPropagation(); if (e.key === 'Enter') commit(); if (e.key === 'Escape') setEditing(false); }}
        onBlur={() => { if (parseValue(text) !== null) commit(); else setEditing(false); }}
        onFocus={e => e.target.select()} />
    );
  }
  return (
    <button className={'editable ' + className} title={`${label} — click to type a new value (25, -7, 0x1F, 'A')`} aria-label={`Edit ${label}`}
      onClick={() => { setText('0x' + (value >>> 0).toString(16).toUpperCase()); setBad(false); setEditing(true); }}>
      {children}
    </button>
  );
}

export interface CpuEdit {
  onReg: (i: number, v: number) => void;
  onMem: (addr: number, v: number) => void;
  onFlag: (f: 'n' | 'z' | 'c' | 'v') => void;
  onClear: () => void;
}

export function CpuView({ asm, watch, edit }: { asm: AsmView | null; watch?: string[]; edit?: CpuEdit }) {
  const [fmt, setFmt] = useState<'hex' | 'dec'>('hex');
  const [base, setBase] = useState<string>('');
  if (!asm) {
    return (
      <div className="cpu">
        <div className="card"><div className="empty">Assemble the program (<kbd>Ctrl</kbd> <kbd>Enter</kbd>) to load it into the ARM7 core. You can then click any register or memory word to type your own input values.</div></div>
      </div>
    );
  }
  const { regs, flags, changed } = asm;
  const ch = new Set(changed);
  const cpsr = asm.cpu.cpsr();
  return (
    <div className="cpu">
      <div className="card">
        <div className="card-h">
          <h4>Registers</h4>
          <span className="grow" />
          <span className="muted mono" style={{ fontSize: 12 }}>{asm.steps.toLocaleString()} instr · {asm.cycles.toLocaleString()} cycles</span>
          <div className="seg-ctl" role="group" aria-label="Number format">
            <button aria-pressed={fmt === 'hex'} onClick={() => setFmt('hex')}>HEX</button>
            <button aria-pressed={fmt === 'dec'} onClick={() => setFmt('dec')}>DEC</button>
          </div>
        </div>
        <div className="regs">
          {regs.map((v, i) => (
            <div key={i} className={'reg' + (ch.has(i) ? ' chg' : '') + (asm.presets.regs.has(i) ? ' preset' : '')} title={`${RN[i]} = 0x${hex8(v)} = ${v >>> 0} (signed ${v | 0})`}>
              <span className="rn">{RN[i]}</span>
              {edit
                ? <Editable value={v} label={RN[i]} onCommit={nv => edit.onReg(i, nv)}>{fmt === 'hex' ? <HexVal v={v} /> : <span className="rv">{(v | 0).toLocaleString()}</span>}</Editable>
                : fmt === 'hex' ? <HexVal v={v} /> : <span className="rv">{(v | 0).toLocaleString()}</span>}
              <span className="rd">{fmt === 'hex' ? (v | 0) : '0x' + (v >>> 0).toString(16).toUpperCase()}</span>
            </div>
          ))}
        </div>
        <div className="flags">
          {([['N', 'negative', flags.n], ['Z', 'zero', flags.z], ['C', 'carry', flags.c], ['V', 'overflow', flags.v]] as const).map(([k, n, on]) => (
            <button key={k} className={'flag' + (on ? ' on' : '')} title={`${n} flag ${on ? 'set' : 'clear'} — click to flip it`} aria-pressed={on} aria-label={`${n} flag`} onClick={() => edit?.onFlag(k.toLowerCase() as 'n' | 'z' | 'c' | 'v')}>{k}<small>{on ? 1 : 0}</small></button>
          ))}
          <span className="cpsr">CPSR 0x{hex8(cpsr)} · SVC · ARM</span>
        </div>
      </div>
      {edit && <InputsBar asm={asm} onClear={edit.onClear} />}
      <MemoryCard asm={asm} watch={watch} base={base} setBase={setBase} edit={edit} />
    </div>
  );
}

function InputsBar({ asm, onClear }: { asm: AsmView; onClear: () => void }) {
  const labelAt = new Map<number, string>();
  for (const [n, sy] of asm.prog.symbols) if (sy.kind === 'data' && !labelAt.has(sy.value)) labelAt.set(sy.value, n);
  const items = [
    ...[...asm.presets.regs].map(([i, v]) => `${RN[i].split(' ')[0]} = ${fmtIn(v)}`),
    ...[...asm.presets.mem].map(([a, v]) => `${labelAt.get(a) ?? '0x' + hex8(a)} = ${fmtIn(v)}`),
  ];
  return (
    <div className="card inputs-bar">
      <div className="card-h">
        <h4>Your inputs</h4>
        <span className="grow" />
        {items.length > 0 && <button className="btn sm ghost" onClick={onClear} title="Remove your inputs and restore the program's own values">Clear</button>}
      </div>
      <div className="inputs-body">
        {items.length
          ? <div className="in-chips">{items.map(t => <span key={t} className="in-chip">{t}</span>)}</div>
          : <p>Click a <b>register</b> or a <b>data-memory word</b> and type a value (25, -7, 0x1F or 'A'). Values set before the first instruction are kept as inputs and applied on every run.</p>}
        {items.length > 0 && asm.steps === 0 && <p className="in-note">Press <b>Assemble &amp; run</b> or step to see the output. If the program loads a register itself (e.g. <code>MOV R0, #25</code>), that instruction overwrites your value, so change the code or the data memory instead.</p>}
      </div>
    </div>
  );
}

function fmtIn(v: number) { const s = v | 0; return Math.abs(s) < 100000 ? `${s} (0x${(v >>> 0).toString(16).toUpperCase()})` : `0x${(v >>> 0).toString(16).toUpperCase()}`; }

function MemoryCard({ asm, watch, base, setBase, edit }: { asm: AsmView; watch?: string[]; base: string; setBase: (s: string) => void; edit?: CpuEdit }) {
  const cpu = asm.cpu;
  const prog = asm.prog;
  const labelAt = useMemo(() => {
    const m = new Map<number, string>();
    for (const [n, s] of prog.symbols) if (s.kind !== 'equ') { const prev = m.get(s.value); m.set(s.value, prev ? prev + ', ' + n : n); }
    return m;
  }, [prog]);
  // region: data area by default, or a typed address/label
  let start = DATA_BASE;
  let end = Math.max(prog.dataEnd, DATA_BASE + 16);
  const q = base.trim();
  if (q) {
    const sym = prog.symbols.get(q) ?? [...prog.symbols.entries()].find(([k]) => k.toUpperCase() === q.toUpperCase())?.[1];
    const num = /^(0x)?[0-9a-f]+$/i.test(q) ? parseInt(q.replace(/^0x/i, ''), 16) : NaN;
    if (sym) start = sym.value & ~3; else if (!isNaN(num)) start = num & ~3;
    end = start + 64;
  }
  const hasData = prog.dataEnd > DATA_BASE;
  const sp = asm.regs[13];
  const stackUsed = sp < 0x40008000;
  const rows: number[] = [];
  for (let a = start; a < end && rows.length < 64; a += 4) rows.push(a);
  const touched = new Set(asm.lastAccess.filter(x => x.write).map(x => x.addr & ~3));
  return (
    <>
      <div className="card">
        <div className="card-h">
          <h4>{q ? 'Memory' : hasData ? 'Data memory' : 'Memory'}</h4>
          <span className="grow" />
          <div className="mem-ctl">
            <input value={base} onChange={e => setBase(e.target.value)} placeholder="go to label or 0x…" aria-label="Go to address or label" spellCheck={false} />
          </div>
        </div>
        {!hasData && !q ? (
          <div className="empty" style={{ color: 'var(--muted)' }}>This program has no DATA area. Type an address (e.g. 0x0) to inspect memory.</div>
        ) : (
          <div style={{ maxHeight: 340, overflow: 'auto' }}>
            <table className="memtab"><tbody>
              {rows.map(a => {
                const w = cpu.peek32(a);
                const wrote = [0, 1, 2, 3].some(i => cpu.written.has(a + i));
                const bytes = [0, 1, 2, 3].map(i => cpu.mem.get(a + i) ?? 0);
                return (
                  <tr key={a}>
                    <td className="addr">{hex8(a)}</td>
                    <td className="lab">{labelAt.get(a) ?? ''}</td>
                    <td className={'w' + (touched.has(a) ? ' chg' : '') + (asm.presets.mem.has(a) ? ' preset' : '')} title={wrote ? 'Written by the program' : ''}>
                      {edit && a >= DATA_BASE && a < 0x40008000
                        ? <Editable value={w} label={`${labelAt.get(a) ?? 'word'} at 0x${hex8(a)}`} onCommit={nv => edit.onMem(a, nv)}>{hex8(w)}</Editable>
                        : hex8(w)}
                      {wrote && !touched.has(a) ? ' ·' : ''}
                    </td>
                    <td className="dec">{w | 0}</td>
                    <td className="asc">{bytes.map(b => (b >= 32 && b < 127 ? String.fromCharCode(b) : '.')).join('')}</td>
                  </tr>
                );
              })}
            </tbody></table>
          </div>
        )}
      </div>
      {stackUsed && (
        <div className="card">
          <div className="card-h"><h4>Stack</h4><span className="grow" /><span className="muted mono" style={{ fontSize: 12 }}>SP = 0x{hex8(sp)}</span></div>
          <table className="memtab"><tbody>
            {Array.from({ length: Math.min(12, (0x40008000 - sp) / 4) }, (_, i) => sp + i * 4).map(a => (
              <tr key={a}><td className="addr">{hex8(a)}</td><td className="lab">{a === sp ? '← SP' : ''}</td><td className="w">{hex8(cpu.peek32(a))}</td><td className="dec">{cpu.peek32(a) | 0}</td></tr>
            ))}
          </tbody></table>
        </div>
      )}
      {watch && watch.length > 0 && <div className="muted" style={{ fontSize: 12, padding: '0 4px' }}>Watch: {watch.join(', ')}</div>}
    </>
  );
}
