// Per-program persistence of the student's edits (browser-local only).
const KEY = 'bench:v1:';

export interface Saved { files: Record<string, string>; at: number }

export function loadSaved(id: string): Saved | null {
  try {
    const s = localStorage.getItem(KEY + id);
    return s ? JSON.parse(s) as Saved : null;
  } catch { return null; }
}

export function save(id: string, files: Record<string, string>) {
  try { localStorage.setItem(KEY + id, JSON.stringify({ files, at: Date.now() })); } catch { /* quota or blocked */ }
}

export function clearSaved(id: string) {
  try { localStorage.removeItem(KEY + id); } catch { /* ignore */ }
}

export function editedSet(): Set<string> {
  const s = new Set<string>();
  try {
    for (let i = 0; i < localStorage.length; i++) {
      const k = localStorage.key(i);
      if (k && k.startsWith(KEY)) s.add(k.slice(KEY.length));
    }
  } catch { /* ignore */ }
  return s;
}

export function pref<T>(name: string, fallback: T): T {
  try { const v = localStorage.getItem('bench:' + name); return v === null ? fallback : JSON.parse(v) as T; } catch { return fallback; }
}
export function setPref(name: string, v: unknown) {
  try { localStorage.setItem('bench:' + name, JSON.stringify(v)); } catch { /* ignore */ }
}
