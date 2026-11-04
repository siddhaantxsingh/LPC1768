import type { SVGProps } from 'react';

type P = SVGProps<SVGSVGElement>;
const base = (p: P) => ({ viewBox: '0 0 20 20', fill: 'none', stroke: 'currentColor', strokeWidth: 1.6, strokeLinecap: 'round' as const, strokeLinejoin: 'round' as const, ...p });

export const IPlay = (p: P) => <svg {...base(p)}><path d="M6.5 4.5v11l9-5.5-9-5.5Z" fill="currentColor" stroke="none" /></svg>;
export const IPause = (p: P) => <svg {...base(p)}><path d="M7 4.5v11M13 4.5v11" strokeWidth={2.2} /></svg>;
export const IStop = (p: P) => <svg {...base(p)}><rect x="5" y="5" width="10" height="10" rx="1.5" fill="currentColor" stroke="none" /></svg>;
export const IStepInto = (p: P) => <svg {...base(p)}><path d="M10 3v9M6.5 8.5 10 12l3.5-3.5" /><circle cx="10" cy="16" r="1.4" fill="currentColor" stroke="none" /></svg>;
export const IStepOver = (p: P) => <svg {...base(p)}><path d="M3.5 11a6.5 6.5 0 0 1 12.4-2.6M16.5 4.5v4h-4" /><circle cx="10" cy="15.5" r="1.4" fill="currentColor" stroke="none" /></svg>;
export const IStepOut = (p: P) => <svg {...base(p)}><path d="M10 12V3M6.5 6.5 10 3l3.5 3.5" /><circle cx="10" cy="16" r="1.4" fill="currentColor" stroke="none" /></svg>;
export const IReset = (p: P) => <svg {...base(p)}><path d="M4 10a6 6 0 1 0 1.8-4.3M4 3.5v3.2h3.2" /></svg>;
export const IBuild = (p: P) => <svg {...base(p)}><path d="M11.5 3.5 7 10h4l-2.5 6.5L14 9h-4l1.5-5.5Z" /></svg>;
export const ISun = (p: P) => <svg {...base(p)}><circle cx="10" cy="10" r="3.4" /><path d="M10 2.5v1.6M10 15.9v1.6M2.5 10h1.6M15.9 10h1.6M4.7 4.7l1.1 1.1M14.2 14.2l1.1 1.1M4.7 15.3l1.1-1.1M14.2 5.8l1.1-1.1" /></svg>;
export const IMoon = (p: P) => <svg {...base(p)}><path d="M15.8 12.3A6.5 6.5 0 0 1 7.7 4.2a6.5 6.5 0 1 0 8.1 8.1Z" /></svg>;
export const ISound = (p: P) => <svg {...base(p)}><path d="M3.5 8v4h3l4 3.5v-11l-4 3.5h-3Z" /><path d="M13.5 7.5a3.5 3.5 0 0 1 0 5M15.5 5.5a6.3 6.3 0 0 1 0 9" /></svg>;
export const IMute = (p: P) => <svg {...base(p)}><path d="M3.5 8v4h3l4 3.5v-11l-4 3.5h-3Z" /><path d="m13.5 8 4 4M17.5 8l-4 4" /></svg>;
export const IChevron = (p: P) => <svg {...base(p)}><path d="m6 8 4 4 4-4" /></svg>;
export const IArrow = (p: P) => <svg {...base(p)}><path d="M4 10h12M11.5 5.5 16 10l-4.5 4.5" /></svg>;
export const IPanel = (p: P) => <svg {...base(p)}><rect x="3" y="4" width="14" height="12" rx="2" /><path d="M8 4v12" /></svg>;
export const IKeyboard = (p: P) => <svg {...base(p)}><rect x="2.5" y="5" width="15" height="10" rx="2" /><path d="M5.5 8h.01M8.5 8h.01M11.5 8h.01M14.5 8h.01M6 12h8" /></svg>;
export const IError = (p: P) => <svg {...base(p)}><circle cx="10" cy="10" r="7" /><path d="M10 6.5v4M10 13.3v.2" /></svg>;
export const IWarn = (p: P) => <svg {...base(p)}><path d="M10 3.5 17.5 16h-15L10 3.5Z" /><path d="M10 8.5v3M10 13.6v.2" /></svg>;
export const ICheck = (p: P) => <svg {...base(p)}><path d="m4.5 10.5 3.5 3.5 7.5-8" /></svg>;
export const IInfo = (p: P) => <svg {...base(p)}><circle cx="10" cy="10" r="7" /><path d="M10 9v4.5M10 6.5v.2" /></svg>;
export const IPlus = (p: P) => <svg {...base(p)}><path d="M10 4v12M4 10h12" /></svg>;
export const IClose = (p: P) => <svg {...base(p)}><path d="m5 5 10 10M15 5 5 15" /></svg>;
export const ICopy = (p: P) => <svg {...base(p)}><rect x="6.5" y="6.5" width="10" height="10" rx="2" /><path d="M13.5 6.5v-2a1.5 1.5 0 0 0-1.5-1.5H5A1.5 1.5 0 0 0 3.5 4.5V12A1.5 1.5 0 0 0 5 13.5h1.5" /></svg>;
export const IDownload = (p: P) => <svg {...base(p)}><path d="M10 3.5v9M6 9l4 4 4-4M4 16.5h12" /></svg>;
export const IUndo = (p: P) => <svg {...base(p)}><path d="M7 5 3.5 8.5 7 12" /><path d="M3.5 8.5H12a4.5 4.5 0 0 1 0 9H8" /></svg>;
export const IPlug = (p: P) => <svg {...base(p)}><path d="M7 3v4M13 3v4M5.5 7h9v3a4.5 4.5 0 0 1-9 0V7ZM10 14.5V17" /></svg>;
export const IFocus = (p: P) => <svg {...base(p)}><path d="M3.5 7V4.5a1 1 0 0 1 1-1H7M13 3.5h2.5a1 1 0 0 1 1 1V7M16.5 13v2.5a1 1 0 0 1-1 1H13M7 16.5H4.5a1 1 0 0 1-1-1V13" /><circle cx="10" cy="10" r="2.2" /></svg>;
export const ITrash = (p: P) => <svg {...base(p)}><path d="M4 6h12M8 6V4.5h4V6M6 6l.7 10h6.6L14 6" /></svg>;
export const IHelp = (p: P) => <svg {...base(p)}><circle cx="10" cy="10" r="7" /><path d="M8 8a2 2 0 1 1 2.8 1.8c-.5.3-.8.7-.8 1.2v.5M10 14v.2" /></svg>;

export function ChipMark(props: P) {
  return (
    <svg viewBox="0 0 32 32" {...props}>
      <rect x="1" y="1" width="30" height="30" rx="8" fill="var(--pcb)" />
      <rect x="9" y="9" width="14" height="14" rx="2.2" fill="#161816" stroke="var(--gold)" strokeWidth="1.2" />
      <g stroke="var(--gold)" strokeWidth="1.6" strokeLinecap="round">
        <path d="M12.5 5v3M16 5v3M19.5 5v3M12.5 24v3M16 24v3M19.5 24v3M5 12.5h3M5 16h3M5 19.5h3M24 12.5h3M24 16h3M24 19.5h3" />
      </g>
      <circle cx="12.6" cy="12.6" r="1.3" fill="var(--gold)" />
    </svg>
  );
}
