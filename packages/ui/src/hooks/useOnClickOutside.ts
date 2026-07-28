'use client';

import { useEffect, type RefObject } from 'react';

/**
 * Appelle `handler` quand un clic (ou un tap) se produit hors des éléments référencés.
 * Écoute `pointerdown` afin de fermer avant qu'un `click` ne se propage.
 */
export function useOnClickOutside(
  refs: RefObject<HTMLElement | null> | RefObject<HTMLElement | null>[],
  handler: (event: Event) => void,
  enabled = true,
): void {
  useEffect(() => {
    if (!enabled || typeof document === 'undefined') return;

    const list = Array.isArray(refs) ? refs : [refs];

    const listener = (event: Event) => {
      const target = event.target as Node | null;
      if (!target) return;
      // Ignore si le clic a eu lieu dans l'un des conteneurs surveillés
      for (const ref of list) {
        const el = ref.current;
        if (el && el.contains(target)) return;
      }
      handler(event);
    };

    document.addEventListener('pointerdown', listener, true);
    return () => document.removeEventListener('pointerdown', listener, true);
  }, [refs, handler, enabled]);
}
