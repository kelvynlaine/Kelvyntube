'use client';

import { useEffect, useState, type RefObject } from 'react';

/**
 * Nombre de colonnes réellement rendues par une grille CSS.
 * Lu directement dans `grid-template-columns` : la rangée de Shorts peut ainsi
 * être insérée après la PREMIÈRE ligne quel que soit le point de rupture
 * (`feed-2` … `feed-6`), sans dupliquer les media queries en JavaScript.
 */
export function useGridColumns(
  ref: RefObject<HTMLElement | null>,
  fallback = 4,
): number {
  const [columns, setColumns] = useState(fallback);

  useEffect(() => {
    const el = ref.current;
    if (!el || typeof window === 'undefined') return;

    const measure = () => {
      const template = window.getComputedStyle(el).gridTemplateColumns;
      if (!template || template === 'none') return;
      const count = template.split(' ').filter(Boolean).length;
      if (count > 0) setColumns(count);
    };

    measure();

    if (typeof ResizeObserver === 'undefined') {
      window.addEventListener('resize', measure);
      return () => window.removeEventListener('resize', measure);
    }

    const observer = new ResizeObserver(measure);
    observer.observe(el);
    return () => observer.disconnect();
  }, [ref]);

  return columns;
}
