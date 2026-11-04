import { useEffect, useRef } from 'react';
import { EditorState, StateEffect, StateField, RangeSet, Compartment, Extension } from '@codemirror/state';
import {
  EditorView, keymap, lineNumbers, highlightActiveLine, highlightActiveLineGutter, drawSelection, gutter, GutterMarker,
  Decoration, DecorationSet, highlightSpecialChars, rectangularSelection, crosshairCursor,
} from '@codemirror/view';
import { defaultKeymap, history, historyKeymap, indentWithTab } from '@codemirror/commands';
import { bracketMatching, indentOnInput, syntaxHighlighting, HighlightStyle, StreamLanguage, foldGutter, indentUnit } from '@codemirror/language';
import { closeBrackets, closeBracketsKeymap } from '@codemirror/autocomplete';
import { searchKeymap, highlightSelectionMatches } from '@codemirror/search';
import { setDiagnostics, lintGutter } from '@codemirror/lint';
import { cpp } from '@codemirror/lang-cpp';
import { tags as t } from '@lezer/highlight';
import type { Lang } from '../content/experiments';

// ---------------- ARM assembly mode ----------------
const MNEM = /^(?:adc|add|and|b|bic|bl|bx|cmn|cmp|eor|ldm|ldr|mla|mov|mrs|msr|mul|mvn|orr|rsb|rsc|sbc|smlal|smull|stm|str|sub|swi|svc|swp|teq|tst|umlal|umull|nop|adr|push|pop|lsl|lsr|asr|ror|rrx)(?:eq|ne|cs|hs|cc|lo|mi|pl|vs|vc|hi|ls|ge|lt|gt|le|al)?(?:s|b|h|sb|sh|ia|ib|da|db|fd|ed|fa|ea)?(?:eq|ne|cs|hs|cc|lo|mi|pl|vs|vc|hi|ls|ge|lt|gt|le|al)?(?:s|b|h|sb|sh)?$/i;
const DIRS = /^(?:area|entry|end|equ|dcd|dcdu|dcw|dcwu|dcb|space|fill|align|export|import|global|extern|preserve8|thumb|arm|code32|ltorg|rn|code|data|readonly|readwrite|noinit)$/i;
const REGS = /^(?:r1[0-5]|r[0-9]|sp|lr|pc|cpsr|spsr)$/i;

const armLang = StreamLanguage.define<{ col0: boolean }>({
  name: 'armasm',
  startState: () => ({ col0: true }),
  token(stream) {
    if (stream.sol()) {
      if (stream.match(/^[A-Za-z_.$][\w.$]*/)) {
        const w = stream.current();
        if (MNEM.test(w)) return 'keyword';
        if (DIRS.test(w)) return 'meta';
        return 'labelName';
      }
    }
    if (stream.eatSpace()) return null;
    if (stream.peek() === ';') { stream.skipToEnd(); return 'comment'; }
    if (stream.match(/^"(?:[^"\\]|\\.)*"?/)) return 'string';
    if (stream.match(/^'(?:\\.|[^'])'/)) return 'string';
    if (stream.match(/^#?-?(?:0[xX][0-9a-fA-F]+|&[0-9a-fA-F]+|0[bB][01]+|\d+)/)) return 'number';
    if (stream.match(/^[=#]/)) return 'operator';
    if (stream.match(/^[A-Za-z_.$][\w.$]*/)) {
      const w = stream.current();
      if (REGS.test(w)) return 'variableName.special';
      if (MNEM.test(w)) return 'keyword';
      if (DIRS.test(w)) return 'meta';
      if (/^(?:lsl|lsr|asr|ror|rrx)$/i.test(w)) return 'keyword';
      return 'labelName';
    }
    stream.next();
    return 'punctuation';
  },
  languageData: { commentTokens: { line: ';' } },
});

// ---------------- highlight style (theme-aware via CSS variables) ----------------
const hl = HighlightStyle.define([
  { tag: [t.keyword, t.controlKeyword, t.operatorKeyword, t.modifier], color: 'var(--syn-kw)' },
  { tag: [t.typeName, t.standard(t.typeName)], color: 'var(--syn-type)' },
  { tag: [t.number, t.bool, t.null], color: 'var(--syn-num)' },
  { tag: [t.string, t.character], color: 'var(--syn-str)' },
  { tag: [t.comment, t.lineComment, t.blockComment], color: 'var(--syn-com)', fontStyle: 'italic' },
  { tag: [t.meta, t.processingInstruction], color: 'var(--syn-meta)' },
  { tag: [t.function(t.variableName), t.function(t.propertyName)], color: 'var(--syn-fn)' },
  { tag: t.special(t.variableName), color: 'var(--syn-reg)', fontWeight: '500' },
  { tag: t.labelName, color: 'var(--syn-label)' },
  { tag: [t.propertyName], color: 'var(--syn-prop)' },
  { tag: [t.operator, t.punctuation, t.bracket], color: 'var(--syn-op)' },
  { tag: t.macroName, color: 'var(--syn-meta)' },
]);

const baseTheme = EditorView.theme({
  '&': { height: '100%', fontSize: '13.5px', backgroundColor: 'var(--code-bg)', color: 'var(--ink)' },
  '.cm-scroller': { fontFamily: 'var(--mono)', lineHeight: '1.62' },
  '.cm-content': { padding: '10px 0 40vh', caretColor: 'var(--accent)' },
  '.cm-line': { padding: '0 16px 0 6px' },
  '.cm-gutters': { backgroundColor: 'var(--code-bg)', color: 'var(--faint)', border: 'none' },
  '.cm-lineNumbers .cm-gutterElement': { padding: '0 10px 0 6px', minWidth: '34px', fontSize: '12px' },
  '.cm-activeLine': { backgroundColor: 'color-mix(in srgb, var(--sunk) 55%, transparent)' },
  '.cm-activeLineGutter': { backgroundColor: 'transparent', color: 'var(--ink-2)' },
  '.cm-selectionBackground, &.cm-focused .cm-selectionBackground, ::selection': { backgroundColor: 'var(--sel) !important' },
  '.cm-cursor': { borderLeftColor: 'var(--accent)', borderLeftWidth: '2px' },
  '.cm-matchingBracket': { backgroundColor: 'var(--accent-soft)', outline: '1px solid color-mix(in srgb, var(--accent) 40%, transparent)' },
  '.cm-selectionMatch': { backgroundColor: 'color-mix(in srgb, var(--warn-soft) 80%, transparent)' },
  '.cm-foldGutter .cm-gutterElement': { color: 'var(--faint)', padding: '0 2px' },
  '.cm-bp-gutter': { width: '18px' },
  '.cm-bp-gutter .cm-gutterElement': { cursor: 'pointer', display: 'flex', alignItems: 'center', justifyContent: 'center' },
  '.cm-bp': { width: '10px', height: '10px', borderRadius: '50%', background: 'var(--err)', boxShadow: '0 0 0 2px color-mix(in srgb, var(--err) 25%, transparent)' },
  '.cm-bp-hover': { width: '10px', height: '10px', borderRadius: '50%', background: 'color-mix(in srgb, var(--err) 30%, transparent)' },
  '.cm-exec-arrow': { width: '0', height: '0', borderTop: '6px solid transparent', borderBottom: '6px solid transparent', borderLeft: '9px solid var(--accent)' },
  '.cm-exec-line': { backgroundColor: 'color-mix(in srgb, var(--accent) 16%, transparent) !important', boxShadow: 'inset 3px 0 0 var(--accent)' },
  '.cm-error-line': { backgroundColor: 'color-mix(in srgb, var(--err) 10%, transparent)', boxShadow: 'inset 3px 0 0 var(--err)' },
  '.cm-tooltip': { background: 'var(--panel)', border: '1px solid var(--line)', borderRadius: '8px', boxShadow: 'var(--shadow-pop)', color: 'var(--ink)' },
  '.cm-tooltip-lint': { padding: '0' },
  '.cm-diagnostic': { padding: '6px 10px', fontFamily: 'var(--sans)', fontSize: '12.5px' },
  '.cm-diagnostic-error': { borderLeft: '3px solid var(--err)' },
  '.cm-diagnostic-warning': { borderLeft: '3px solid var(--warn)' },
  '.cm-lintRange-error': { backgroundImage: 'none', textDecoration: 'underline wavy var(--err)', textUnderlineOffset: '3px' },
  '.cm-lintRange-warning': { backgroundImage: 'none', textDecoration: 'underline wavy var(--warn)', textUnderlineOffset: '3px' },
  '.cm-gutter-lint': { width: '14px' },
  '.cm-gutter-lint .cm-gutterElement': { padding: '0' },
  '.cm-lint-marker': { width: '10px', height: '10px', margin: '4px 2px' },
  '.cm-panels': { background: 'var(--panel-2)', color: 'var(--ink)', borderColor: 'var(--line)' },
  '.cm-panel.cm-search': { padding: '6px 10px', fontFamily: 'var(--sans)' },
  '.cm-panel.cm-search input, .cm-panel.cm-search button': { fontFamily: 'var(--sans)', fontSize: '12px', borderRadius: '6px' },
  '.cm-textfield': { border: '1px solid var(--line-2)', background: 'var(--panel)' },
  '.cm-button': { backgroundImage: 'none', background: 'var(--panel)', border: '1px solid var(--line-2)' },
  '.cm-searchMatch': { backgroundColor: 'var(--warn-soft)', outline: '1px solid color-mix(in srgb, var(--warn) 40%, transparent)' },
});

// ---------------- breakpoints & exec line ----------------
const setBps = StateEffect.define<number[]>();
const bpField = StateField.define<Set<number>>({
  create: () => new Set(),
  update(v, tr) {
    for (const e of tr.effects) if (e.is(setBps)) return new Set(e.value);
    if (tr.docChanged && v.size) {
      // keep breakpoints attached to their lines as text is edited
      const n = new Set<number>();
      for (const ln of v) {
        if (ln > tr.startState.doc.lines) continue;
        const pos = tr.startState.doc.line(ln).from;
        const np = tr.changes.mapPos(pos, 1);
        n.add(tr.state.doc.lineAt(np).number);
      }
      return n;
    }
    return v;
  },
});
const setExec = StateEffect.define<{ exec: number | null; err: number | null }>();
const execField = StateField.define<{ exec: number | null; err: number | null }>({
  create: () => ({ exec: null, err: null }),
  update(v, tr) { for (const e of tr.effects) if (e.is(setExec)) return e.value; return tr.docChanged ? { exec: null, err: v.err } : v; },
});
const execDeco = EditorView.decorations.compute([execField], state => {
  const { exec, err } = state.field(execField);
  const ranges: any[] = [];
  const doc = state.doc;
  if (err && err <= doc.lines) ranges.push(Decoration.line({ class: 'cm-error-line' }).range(doc.line(err).from));
  if (exec && exec <= doc.lines) ranges.push(Decoration.line({ class: 'cm-exec-line' }).range(doc.line(exec).from));
  ranges.sort((a, b) => a.from - b.from);
  return Decoration.set(ranges, true) as DecorationSet;
});

class BpMarker extends GutterMarker { toDOM() { const d = document.createElement('div'); d.className = 'cm-bp'; return d; } }
class ExecMarker extends GutterMarker { toDOM() { const d = document.createElement('div'); d.className = 'cm-exec-arrow'; return d; } }
const bpMarker = new BpMarker();
const execMarker = new ExecMarker();

function bpGutter(onToggle: (line: number) => void): Extension {
  return gutter({
    class: 'cm-bp-gutter',
    markers: v => {
      const bps = v.state.field(bpField);
      const { exec } = v.state.field(execField);
      const marks: any[] = [];
      const doc = v.state.doc;
      const lines = new Set<number>([...bps].filter(l => l <= doc.lines));
      if (exec && exec <= doc.lines) lines.add(exec);
      for (const l of [...lines].sort((a, b) => a - b)) {
        marks.push((exec === l ? execMarker : bpMarker).range(doc.line(l).from));
      }
      return RangeSet.of(marks);
    },
    initialSpacer: () => bpMarker,
    domEventHandlers: {
      mousedown(view, line) {
        onToggle(view.state.doc.lineAt(line.from).number);
        return true;
      },
    },
  });
}

export interface EditorProps {
  value: string;
  lang: Lang;
  fileKey: string;
  onChange: (v: string) => void;
  breakpoints: Set<number>;
  onToggleBreakpoint: (line: number) => void;
  execLine: number | null;
  errorLine: number | null;
  diagnostics: { line: number; col?: number; msg: string; severity: 'error' | 'warning' }[];
  commands: { run: () => void; buildRun: () => void; pause: () => void; stepOver: () => void; stepInto: () => void; stepOut: () => void; reset: () => void; save: () => void };
  revealLine?: { line: number; n: number } | null;
}

export function CodeEditor(p: EditorProps) {
  const host = useRef<HTMLDivElement>(null);
  const view = useRef<EditorView | null>(null);
  const cb = useRef(p);
  cb.current = p;
  const langComp = useRef(new Compartment());

  useEffect(() => {
    const cmd = (f: () => void) => () => { f(); return true; };
    const state = EditorState.create({
      doc: p.value,
      extensions: [
        bpField, execField, execDeco,
        bpGutter(l => cb.current.onToggleBreakpoint(l)),
        lineNumbers(),
        foldGutter({ openText: '▾', closedText: '▸' }),
        lintGutter(),
        highlightSpecialChars(), history(), drawSelection(), indentOnInput(), bracketMatching(), closeBrackets(),
        rectangularSelection(), crosshairCursor(), highlightActiveLine(), highlightActiveLineGutter(), highlightSelectionMatches(),
        indentUnit.of('    '),
        EditorState.tabSize.of(4),
        langComp.current.of(p.lang === 'c' ? cpp() : armLang),
        syntaxHighlighting(hl),
        baseTheme,
        keymap.of([
          { key: 'Mod-Enter', run: cmd(() => cb.current.commands.buildRun()), preventDefault: true },
          { key: 'F5', run: cmd(() => cb.current.commands.run()), preventDefault: true },
          { key: 'F6', run: cmd(() => cb.current.commands.pause()), preventDefault: true },
          { key: 'F10', run: cmd(() => cb.current.commands.stepOver()), preventDefault: true },
          { key: 'F11', run: cmd(() => cb.current.commands.stepInto()), preventDefault: true },
          { key: 'Shift-F11', run: cmd(() => cb.current.commands.stepOut()), preventDefault: true },
          { key: 'Mod-Shift-r', run: cmd(() => cb.current.commands.reset()), preventDefault: true },
          { key: 'Mod-s', run: cmd(() => cb.current.commands.save()), preventDefault: true },
          ...closeBracketsKeymap, ...defaultKeymap, ...searchKeymap, ...historyKeymap, indentWithTab,
        ]),
        EditorView.updateListener.of(u => { if (u.docChanged) cb.current.onChange(u.state.doc.toString()); }),
        EditorView.contentAttributes.of({ 'aria-label': 'Code editor', spellcheck: 'false', autocorrect: 'off', autocapitalize: 'off' }),
      ],
    });
    const v = new EditorView({ state, parent: host.current! });
    view.current = v;
    return () => { v.destroy(); view.current = null; };
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, []);

  // switch file / external value change
  useEffect(() => {
    const v = view.current;
    if (!v) return;
    const cur = v.state.doc.toString();
    if (cur !== p.value) {
      v.dispatch({ changes: { from: 0, to: cur.length, insert: p.value } });
    }
  }, [p.value, p.fileKey]);

  useEffect(() => {
    const v = view.current;
    if (!v) return;
    v.dispatch({ effects: langComp.current.reconfigure(p.lang === 'c' ? cpp() : armLang) });
  }, [p.lang]);

  useEffect(() => {
    view.current?.dispatch({ effects: setBps.of([...p.breakpoints]) });
  }, [p.breakpoints, p.fileKey]);

  useEffect(() => {
    const v = view.current;
    if (!v) return;
    v.dispatch({ effects: setExec.of({ exec: p.execLine, err: p.errorLine }) });
    const ln = p.execLine ?? p.errorLine;
    if (ln && ln <= v.state.doc.lines) {
      const pos = v.state.doc.line(ln).from;
      const rect = v.lineBlockAt(pos);
      const sc = v.scrollDOM;
      if (rect.top < sc.scrollTop + 20 || rect.bottom > sc.scrollTop + sc.clientHeight - 40) {
        v.dispatch({ effects: EditorView.scrollIntoView(pos, { y: 'center' }) });
      }
    }
  }, [p.execLine, p.errorLine, p.fileKey]);

  useEffect(() => {
    const v = view.current;
    if (!v) return;
    const doc = v.state.doc;
    const diags = p.diagnostics.filter(d => d.line >= 1 && d.line <= doc.lines).map(d => {
      const line = doc.line(d.line);
      let from = line.from, to = line.to;
      const text = line.text;
      const lead = text.length - text.trimStart().length;
      from = line.from + lead;
      if (to <= from) to = Math.min(doc.length, from + 1);
      return { from, to, severity: d.severity, message: d.msg };
    });
    v.dispatch(setDiagnostics(v.state, diags));
  }, [p.diagnostics, p.fileKey, p.value]);

  useEffect(() => {
    const v = view.current;
    if (!v || !p.revealLine) return;
    const ln = Math.min(p.revealLine.line, v.state.doc.lines);
    if (ln < 1) return;
    const line = v.state.doc.line(ln);
    v.dispatch({ selection: { anchor: line.from }, effects: EditorView.scrollIntoView(line.from, { y: 'center' }) });
    v.focus();
  }, [p.revealLine]);

  return <div className="editor-wrap" ref={host} />;
}
