'use client';

import { useEffect, useRef, type RefObject } from 'react';

export interface UseImpressionOptions {
  /** Fraction de l'élément devant être visible (0-1). */
  threshold?: number;
  /** Désactive l'observation. */
  disabled?: boolean;
}

/**
 * Déclenche `onImpression` UNE SEULE FOIS lorsque l'élément devient visible.
 * Alimente le calcul du CTR (impressions de miniatures).
 */
export function useImpression<T extends HTMLElement>(
  ref: RefObject<T | null>,
  onImpression?: () => void,
  { threshold = 0.5, disabled = false }: UseImpressionOptions = {},
): void {
  const firedRef = useRef(false);
  const callbackRef = useRef(onImpression);
  callbackRef.current = onImpression;

  useEffect(() => {
    if (disabled || !onImpression) return;
    if (typeof IntersectionObserver === 'undefined') return;

    const el = ref.current;
    if (!el || firedRef.current) return;

    const observer = new IntersectionObserver(
      (entries) => {
        for (const entry of entries) {
          if (entry.isIntersecting && !firedRef.current) {
            firedRef.current = true;
            callbackRef.current?.();
            observer.disconnect();
          }
        }
      },
      { threshold },
    );

    observer.observe(el);
    return () => observer.disconnect();
    // `onImpression` volontairement hors dépendances : stocké dans callbackRef
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [ref, threshold, disabled, Boolean(onImpression)]);
}
