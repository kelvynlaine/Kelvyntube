'use client';

import { useCallback, useEffect, useRef } from 'react';
import { ROUTES, type TrafficSource } from '@kelvyntube/shared';
import { api } from '@/lib/api';

/**
 * ═══════════════════════════════════════════════════════════════════════════
 *  SUIVI DES IMPRESSIONS ET DES CLICS (CTR)
 *  Chaque miniature visible à 50 % déclenche une impression. Les identifiants
 *  sont accumulés dans un tampon puis envoyés par lot — c'est la source du
 *  taux de clics qui alimente l'algorithme de recommandation.
 *
 *  Garanties :
 *   - un identifiant n'est envoyé qu'une seule fois par session de page ;
 *   - envoi toutes les 2 s OU dès 20 identifiants en attente ;
 *   - vidage forcé quand l'onglet passe en arrière-plan et au démontage ;
 *   - erreurs réseau silencieuses : la mesure ne doit jamais casser le feed.
 * ═══════════════════════════════════════════════════════════════════════════
 */

/** Taille de lot déclenchant un envoi immédiat. */
const DEFAULT_BATCH_SIZE = 20;
/** Période de vidage du tampon, en millisecondes. */
const DEFAULT_FLUSH_MS = 2_000;
/** Limite imposée par `impressionBatchSchema` côté API. */
const MAX_IDS_PER_REQUEST = 100;

export interface UseImpressionTrackerOptions {
  /** Origine du trafic associée aux mesures (`HOME`, `SHORTS`…). */
  source?: TrafficSource;
  batchSize?: number;
  flushIntervalMs?: number;
  /** Désactive complètement la mesure. */
  enabled?: boolean;
}

export interface ImpressionTracker {
  /** À brancher sur `VideoCard.onImpression`. */
  trackImpression: (videoId: string) => void;
  /** À brancher sur `VideoCard.onClick` (numérateur du CTR). */
  trackClick: (videoId: string) => void;
  /** Vide immédiatement le tampon (navigation interne, changement de filtre). */
  flush: () => void;
}

export function useImpressionTracker({
  source = 'HOME',
  batchSize = DEFAULT_BATCH_SIZE,
  flushIntervalMs = DEFAULT_FLUSH_MS,
  enabled = true,
}: UseImpressionTrackerOptions = {}): ImpressionTracker {
  /** Identifiants en attente d'envoi. */
  const bufferRef = useRef<string[]>([]);
  /** Identifiants déjà comptés durant cette session de page. */
  const seenRef = useRef<Set<string>>(new Set());
  const timerRef = useRef<ReturnType<typeof setTimeout> | null>(null);

  // Valeurs lues au moment de l'envoi : évite de recréer les callbacks.
  const sourceRef = useRef(source);
  sourceRef.current = source;
  const intervalRef = useRef(flushIntervalMs);
  intervalRef.current = flushIntervalMs;

  /**
   * Référence auto-appelante : `flush` doit pouvoir se replanifier lui-même
   * lorsqu'il reste des identifiants au-delà de la limite d'une requête.
   */
  const flushRef = useRef<() => void>(() => undefined);

  flushRef.current = () => {
    if (timerRef.current) {
      clearTimeout(timerRef.current);
      timerRef.current = null;
    }

    const videoIds = bufferRef.current.splice(0, MAX_IDS_PER_REQUEST);
    if (videoIds.length === 0) return;

    void api
      .post(
        ROUTES.views.impressions,
        { videoIds, source: sourceRef.current },
        { allowAnonymous: true },
      )
      .catch(() => {
        /* mesure best-effort : on n'interrompt jamais la navigation */
      });

    if (bufferRef.current.length > 0) {
      timerRef.current = setTimeout(() => {
        timerRef.current = null;
        flushRef.current();
      }, intervalRef.current);
    }
  };

  const flush = useCallback(() => flushRef.current(), []);

  const trackImpression = useCallback(
    (videoId: string) => {
      if (!enabled || !videoId) return;
      // Une impression par vidéo et par session de page.
      if (seenRef.current.has(videoId)) return;
      seenRef.current.add(videoId);
      bufferRef.current.push(videoId);

      if (bufferRef.current.length >= batchSize) {
        flushRef.current();
        return;
      }
      if (!timerRef.current) {
        timerRef.current = setTimeout(() => {
          timerRef.current = null;
          flushRef.current();
        }, flushIntervalMs);
      }
    },
    [batchSize, enabled, flushIntervalMs],
  );

  const trackClick = useCallback(
    (videoId: string) => {
      if (!enabled || !videoId) return;
      // Le clic part immédiatement : la page de visionnage va prendre la main.
      void api
        .post(
          ROUTES.views.click,
          { videoId, source: sourceRef.current },
          { allowAnonymous: true },
        )
        .catch(() => {
          /* mesure best-effort */
        });
    },
    [enabled],
  );

  // Vidage quand l'onglet passe en arrière-plan (l'utilisateur peut ne jamais revenir).
  useEffect(() => {
    if (!enabled || typeof document === 'undefined') return;
    const onVisibilityChange = () => {
      if (document.visibilityState === 'hidden') flushRef.current();
    };
    document.addEventListener('visibilitychange', onVisibilityChange);
    return () => document.removeEventListener('visibilitychange', onVisibilityChange);
  }, [enabled]);

  // Dernier vidage au démontage (changement de page).
  useEffect(
    () => () => {
      flushRef.current();
      if (timerRef.current) clearTimeout(timerRef.current);
    },
    [],
  );

  return { trackImpression, trackClick, flush };
}
