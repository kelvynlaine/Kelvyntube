'use client';

import { useEffect } from 'react';

/** Compteur global : plusieurs surfaces modales peuvent être ouvertes en même temps. */
let lockCount = 0;
let previousOverflow = '';
let previousPaddingRight = '';

/** Verrouille le scroll de `document.body` tant que `locked` est vrai. */
export function useLockBodyScroll(locked: boolean): void {
  useEffect(() => {
    if (!locked || typeof document === 'undefined') return;

    const body = document.body;
    if (lockCount === 0) {
      previousOverflow = body.style.overflow;
      previousPaddingRight = body.style.paddingRight;
      // Compense la disparition de la scrollbar pour éviter un saut de mise en page
      const scrollbar = window.innerWidth - document.documentElement.clientWidth;
      if (scrollbar > 0) body.style.paddingRight = `${scrollbar}px`;
      body.style.overflow = 'hidden';
      body.dataset.lockScroll = 'true';
    }
    lockCount += 1;

    return () => {
      lockCount -= 1;
      if (lockCount === 0) {
        body.style.overflow = previousOverflow;
        body.style.paddingRight = previousPaddingRight;
        delete body.dataset.lockScroll;
      }
    };
  }, [locked]);
}
