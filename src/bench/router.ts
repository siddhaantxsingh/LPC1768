import { useEffect, useState } from 'react';

export type Route =
  | { page: 'home' }
  | { page: 'exp'; exp: number; prog: string }
  | { page: 'play'; lang: 'c' | 'asm' };

export function parseHash(h: string): Route {
  const m = /^#\/exp\/(\d+)(?:\/([px]\d+))?/.exec(h);
  if (m) return { page: 'exp', exp: Number(m[1]), prog: m[2] ?? 'p1' };
  const p = /^#\/play\/(c|asm)/.exec(h);
  if (p) return { page: 'play', lang: p[1] as 'c' | 'asm' };
  return { page: 'home' };
}

export function useRoute(): Route {
  const [r, setR] = useState<Route>(() => parseHash(location.hash));
  useEffect(() => {
    const on = () => setR(parseHash(location.hash));
    window.addEventListener('hashchange', on);
    return () => window.removeEventListener('hashchange', on);
  }, []);
  return r;
}

export const href = {
  home: () => '#/',
  exp: (n: number, p = 'p1') => `#/exp/${n}/${p}`,
  play: (lang: 'c' | 'asm') => `#/play/${lang}`,
};
