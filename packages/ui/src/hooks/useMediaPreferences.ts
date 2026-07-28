'use client';

import { useEffect, useState } from 'react';

/** Écoute générique d'une media query (SSR-safe : `false` au premier rendu). */
export function useMediaQuery(query: string): boolean {
  const [matches, setMatches] = useState(false);

  useEffect(() => {
    if (typeof window === 'undefined' || !window.matchMedia) return;
    const mql = window.matchMedia(query);
    setMatches(mql.matches);
    const onChange = (event: MediaQueryListEvent) => setMatches(event.matches);
    mql.addEventListener('change', onChange);
    return () => mql.removeEventListener('change', onChange);
  }, [query]);

  return matches;
}

/** Vrai si l'utilisateur a demandé une réduction des animations. */
export function usePrefersReducedMotion(): boolean {
  return useMediaQuery('(prefers-reduced-motion: reduce)');
}

/** Vrai si le pointeur principal est tactile (pas d'aperçu au survol). */
export function useIsTouchDevice(): boolean {
  return useMediaQuery('(hover: none), (pointer: coarse)');
}
