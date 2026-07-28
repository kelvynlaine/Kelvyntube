'use client';

import { useCallback, useEffect, useRef, useState } from 'react';
import { useToast, type ToastOptions } from '@kelvyntube/ui';

/**
 * ═══════════════════════════════════════════════════════════════════════════
 *  PETITS HOOKS DE LA BIBLIOTHÈQUE
 * ═══════════════════════════════════════════════════════════════════════════
 */

/**
 * Notifications tolérantes : si `<ToastProvider>` n'est pas monté (au-dessus
 * de nous dans l'arbre), on retombe sur une fonction vide plutôt que de faire
 * planter la page entière. `useToast` appelle toujours `useContext` avant de
 * lever son erreur : l'ordre des hooks reste donc stable d'un rendu à l'autre.
 */
export function useLibraryToast(): (options: ToastOptions | string) => void {
  let toast: ((options: ToastOptions | string) => string) | null = null;
  try {
    // eslint-disable-next-line react-hooks/rules-of-hooks
    toast = useToast().toast;
  } catch {
    toast = null;
  }
  return useCallback(
    (options: ToastOptions | string) => {
      toast?.(options);
    },
    [toast],
  );
}

/**
 * État persisté dans `localStorage` (préférences purement locales : mode
 * d'affichage, suspension de l'historique…). Rendu serveur : la valeur par
 * défaut est utilisée, la valeur stockée est lue après le montage pour
 * éviter toute désynchronisation d'hydratation.
 */
export function useLocalStorageState<T>(
  key: string,
  defaultValue: T,
): [T, (value: T) => void, boolean] {
  const [value, setValue] = useState<T>(defaultValue);
  const [hydrated, setHydrated] = useState(false);

  useEffect(() => {
    try {
      const raw = window.localStorage.getItem(key);
      if (raw !== null) setValue(JSON.parse(raw) as T);
    } catch {
      // Stockage indisponible (mode privé) : on garde la valeur par défaut.
    }
    setHydrated(true);
  }, [key]);

  const update = useCallback(
    (next: T) => {
      setValue(next);
      try {
        window.localStorage.setItem(key, JSON.stringify(next));
      } catch {
        // Écriture impossible : la préférence ne sera simplement pas retenue.
      }
    },
    [key],
  );

  return [value, update, hydrated];
}

/** Valeur retardée : ne change que `delay` ms après la dernière frappe. */
export function useDebouncedValue<T>(value: T, delay: number): T {
  const [debounced, setDebounced] = useState(value);

  useEffect(() => {
    const timer = setTimeout(() => setDebounced(value), delay);
    return () => clearTimeout(timer);
  }, [value, delay]);

  return debounced;
}

/**
 * Déclenche `onVisible` quand la sentinelle entre dans le viewport.
 * Sert à la pagination infinie sans dépendance externe.
 */
export function useInfiniteScroll(
  onVisible: () => void,
  active: boolean,
): (node: HTMLElement | null) => void {
  const callbackRef = useRef(onVisible);
  callbackRef.current = onVisible;

  const observerRef = useRef<IntersectionObserver | null>(null);

  return useCallback(
    (node: HTMLElement | null) => {
      observerRef.current?.disconnect();
      if (!node || !active || typeof IntersectionObserver === 'undefined') return;

      observerRef.current = new IntersectionObserver(
        (entries) => {
          if (entries.some((entry) => entry.isIntersecting)) {
            callbackRef.current();
          }
        },
        { rootMargin: '600px 0px' },
      );
      observerRef.current.observe(node);
    },
    [active],
  );
}
