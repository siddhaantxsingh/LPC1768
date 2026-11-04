// Privacy-friendly usage counting with GoatCounter (no cookies, no personal data).
// The site uses #/hash routes, so page views are sent manually on every route change.
// Dashboard: https://siddhaantxsingh.goatcounter.com

declare global {
  interface Window { goatcounter?: { count: (o: { path: string; title?: string; event?: boolean }) => void; no_onload?: boolean } }
}

type Hit = { path: string; title?: string; event?: boolean };
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
    try { gc.count(queue.shift()!); } catch { /* never let analytics break the app */ }
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
