import { defineConfig, Plugin } from 'vite';
import react from '@vitejs/plugin-react';

/**
 * Emits sw.js with the full list of built files so the whole site (code editor,
 * simulator, fonts) is cached on the first visit and keeps working offline.
 */
function offline(): Plugin {
  return {
    name: 'bench-offline',
    apply: 'build',
    generateBundle(_, bundle) {
      const files = Object.keys(bundle).filter(f => !f.endsWith('.map'));
      const version = Date.now().toString(36);
      const list = JSON.stringify(['./', './index.html', './favicon.svg', './manifest.webmanifest', './icon-192.png', './icon-512.png', ...files.map(f => './' + f)]);
      this.emitFile({
        type: 'asset',
        fileName: 'sw.js',
        source: `// Generated at build time — caches the whole app for offline use.
const CACHE = 'bench-${version}';
const FILES = ${list};
self.addEventListener('install', e => {
  e.waitUntil(caches.open(CACHE).then(c => Promise.all(FILES.map(f => c.add(f).catch(() => {})))).then(() => self.skipWaiting()));
});
self.addEventListener('activate', e => {
  e.waitUntil(caches.keys().then(keys => Promise.all(keys.filter(k => k.startsWith('bench-') && k !== CACHE).map(k => caches.delete(k)))).then(() => self.clients.claim()));
});
self.addEventListener('fetch', e => {
  const req = e.request;
  if (req.method !== 'GET' || new URL(req.url).origin !== location.origin) return;
  if (req.mode === 'navigate') {
    // network first for the page so updates arrive, cached copy when offline
    e.respondWith(fetch(req).then(r => { const copy = r.clone(); caches.open(CACHE).then(c => c.put('./index.html', copy)); return r; })
      .catch(() => caches.match('./index.html')));
    return;
  }
  e.respondWith(caches.match(req).then(hit => hit || fetch(req).then(r => {
    if (r.ok) { const copy = r.clone(); caches.open(CACHE).then(c => c.put(req, copy)); }
    return r;
  })));
});
`,
      });
    },
  };
}

// `base: './'` keeps every asset path relative, so the same build works on
// Vercel, Netlify, Cloudflare Pages or a GitHub Pages sub-folder.
export default defineConfig({
  base: './',
  plugins: [react(), offline()],
  build: {
    target: 'es2020',
    chunkSizeWarningLimit: 1200,
  },
});
