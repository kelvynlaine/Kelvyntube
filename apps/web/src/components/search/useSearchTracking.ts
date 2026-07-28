'use client';

import { ROUTES, type TrafficSource } from '@kelvyntube/shared';
import { useCallback, useEffect, useRef } from 'react';
import { api } from '@/lib/api';

/**
 * ═══════════════════════════════════════════════════════════════════════════
 *  SUIVI DES IMPRESSIONS ET DES CLICS (source « SEARCH »)
 *  Les impressions sont regroupées puis envoyées en un seul appel afin de
 *  ne pas générer une requête par miniature visible.
 * ═══════════════════════════════════════════════════════════════════════════
 */

/** Fenêtre de regroupement des impressions, en millisecondes. */
const FLUSH_DELAY_MS = 1_500;
/** `impressionBatchSchema` plafonne le lot à 100 identifiants. */
const MAX_BATCH = 100;

export interface SearchTracking {
  /** Miniature devenue visible (déclenché une seule fois par carte). */
  trackImpression: (videoId: string) => void;
  /** Clic sur une carte de résultat. */
  trackClick: (videoId: string) => void;
}

export function useSearchTracking(source: TrafficSource = 'SEARCH'): SearchTracking {
  const pending = useRef<Set<string>>(new Set());
  const timer = useRef<ReturnType<typeof setTimeout> | null>(null);

  const flush = useCallback(() => {
    if (timer.current) {
      clearTimeout(timer.current);
      timer.current = null;
    }
    if (pending.current.size === 0) return;

    const videoIds = Array.from(pending.current).slice(0, MAX_BATCH);
    for (const id of videoIds) pending.current.delete(id);

    // Le suivi est « au mieux » : une erreur réseau ne doit rien casser.
    void api
      .post(ROUTES.views.impressions, { videoIds, source }, { allowAnonymous: true })
      .catch(() => undefined);
  }, [source]);

  const trackImpression = useCallback(
    (videoId: string) => {
      pending.current.add(videoId);
      if (pending.current.size >= MAX_BATCH) {
        flush();
        return;
      }
      timer.current ??= setTimeout(flush, FLUSH_DELAY_MS);
    },
    [flush],
  );

  const trackClick = useCallback(
    (videoId: string) => {
      void api
        .post(ROUTES.views.click, { videoId, source }, { allowAnonymous: true })
        .catch(() => undefined);
    },
    [source],
  );

  // Envoi des impressions restantes lors d'un départ de page ou d'un démontage.
  useEffect(() => {
    const onHide = () => flush();
    document.addEventListener('visibilitychange', onHide);
    window.addEventListener('pagehide', onHide);
    return () => {
      document.removeEventListener('visibilitychange', onHide);
      window.removeEventListener('pagehide', onHide);
      flush();
    };
  }, [flush]);

  return { trackImpression, trackClick };
}
