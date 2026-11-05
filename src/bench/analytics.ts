// Privacy-friendly usage counting with GoatCounter (no cookies, no personal data).
// The site uses #/hash routes, so page views are sent manually on every route change.
// Dashboard: https://siddhaantxsingh.goatcounter.com

declare global {
  interface Window { goatcounter?: { count: (o: { path: string; title?: string; event?: boolean }) => void; no_onload?: boolean } }
}

type Hit = { path: string; title?: string; event?: boolean; sent?: () => void };
const queue: Hit[] = [];
let timer = 0;

function flush() {
  const gc = window.goatcounter;
  if (!gc || typeof gc.count !== 'function') {
    // the script loads asynchronously (or is blocked / offline): retry for a while, then give up quietly
    if (!timer) timer = window.setTimeout(() => { timer = 0; if (queue.length && queue.length < 50) flush(); }, 1500);
    return;
  }
  while (queue.length) {
    const hit = queue.shift()!;
    try {
      gc.count({ path: hit.path, title: hit.title, event: hit.event });
      hit.sent?.();
    } catch { /* never let analytics break the app */ }
  }
}

/** A page view, e.g. "/exp/5/p1". */
export function trackPage(path: string, title?: string) {
  queue.push({ path, title });
  flush();
}

/** A custom event, counted at most once per visit for each name (keeps numbers honest). */
export function trackEvent(name: string, title?: string) {
  const key = 'gc:' + name;
  try {
    if (sessionStorage.getItem(key)) return;
    sessionStorage.setItem(key, '1');
  } catch { /* storage blocked: still count */ }
  queue.push({ path: name, title, event: true });
  flush();
}

function once(storageKey: string, path: string, title: string) {
  try { if (localStorage.getItem(storageKey)) return; } catch { return; /* no storage: cannot dedupe, skip */ }
  // remember only after the hit was really handed to GoatCounter, so a blocked or offline
  // first visit is counted next time instead of being lost
  queue.push({ path, title, event: true, sent: () => { try { localStorage.setItem(storageKey, '1'); } catch { /* ignore */ } } });
  flush();
}

/**
 * Counts people, not page views: each browser is counted once ever ("students/unique")
 * and once per calendar day ("students/daily"). No cookies or IDs are stored, only a flag.
 */
export function trackStudent() {
  const d = new Date();
  const day = `${d.getFullYear()}-${String(d.getMonth() + 1).padStart(2, '0')}-${String(d.getDate()).padStart(2, '0')}`;
  once('gc:student', 'students/unique', 'Unique students (each device counted once)');
  once('gc:student-day:' + day, 'students/daily', 'Daily active students (each device once a day)');
  try {
    for (let i = localStorage.length - 1; i >= 0; i--) {
      const k = localStorage.key(i);
      if (k && k.startsWith('gc:student-day:') && k !== 'gc:student-day:' + day) localStorage.removeItem(k);
    }
  } catch { /* ignore */ }
}
