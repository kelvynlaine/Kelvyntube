'use client';

import { useCallback, useEffect, useRef, useState } from 'react';
import { ROUTES, WS_EVENTS, type TrafficSource, type WatchHeartbeatInput } from '@kelvyntube/shared';
import { API_BASE, api } from '@/lib/api';
import { getSessionId } from '@/lib/player-storage';
import { useRealtimeEvent } from '@/lib/realtime-context';
import type { VideoElementRef } from './useHlsPlayer';

/** Intervalle de heartbeat, exprimé en secondes de lecture EFFECTIVE. */
const HEARTBEAT_INTERVAL_SEC = 10;

/**
 * Écart maximal accepté entre deux `timeupdate` (en secondes de vidéo).
 * Au-delà, il s'agit d'un saut dans la timeline : on ne crédite pas de
 * watch-time. Multiplié par la vitesse de lecture courante.
 */
const MAX_TIMEUPDATE_DELTA = 1.5;

/** Réponse de `POST /views/heartbeat` (cf. `HeartbeatResult` côté API). */
interface HeartbeatResponse {
  counted: boolean;
  viewCount: number;
}

export interface UseWatchTrackingOptions {
  videoId: string;
  videoRef: VideoElementRef;
  /** Provenance du visionnage, fournie par la page appelante. */
  source?: TrafficSource;
  /** Compteur initial affiché avant le premier heartbeat. */
  initialViewCount?: number;
  /** Désactive complètement le suivi (aperçus, Studio…). */
  enabled?: boolean;
  /** Suit le compteur en temps réel via WebSocket. */
  realtime?: boolean;
}

export interface UseWatchTrackingResult {
  /** Compteur de vues à jour (serveur + WebSocket). */
  viewCount: number;
  /** Vrai dès qu'un heartbeat a validé une nouvelle vue. */
  counted: boolean;
  /** Temps réellement visionné cumulé (secondes, hors pauses et sauts). */
  watchedSec: number;
}

function isDev(): boolean {
  return process.env.NODE_ENV !== 'production';
}

/**
 * Comptage de vues côté client, conforme au contrat serveur
 * (`watchHeartbeatSchema`) :
 *  - un heartbeat toutes les 10 s de lecture EFFECTIVE ;
 *  - `watchedSec` n'accumule ni les pauses, ni le buffering, ni l'onglet
 *    caché, ni les sauts dans la timeline ;
 *  - un dernier ping best-effort via `sendBeacon` au déchargement.
 * Une erreur réseau n'interrompt jamais la lecture.
 */
export function useWatchTracking({
  videoId,
  videoRef,
  source = 'DIRECT',
  initialViewCount = 0,
  enabled = true,
  realtime = true,
}: UseWatchTrackingOptions): UseWatchTrackingResult {
  const [viewCount, setViewCount] = useState(initialViewCount);
  const [counted, setCounted] = useState(false);
  const [watchedSec, setWatchedSec] = useState(0);

  /** Temps visionné cumulé (ref : évite de re-rendre à chaque `timeupdate`). */
  const watchedRef = useRef(0);
  /** Valeur envoyée lors du dernier heartbeat. */
  const lastSentRef = useRef(0);
  /** Dernière position connue ; `null` = accumulation suspendue. */
  const lastPosRef = useRef<number | null>(null);
  /** Position mémorisée : le `<video>` peut déjà être détaché au démontage. */
  const lastKnownPositionRef = useRef(0);
  /** Empêche deux heartbeats concurrents. */
  const inFlightRef = useRef(false);
  const sessionIdRef = useRef<string>('');
  const sourceRef = useRef<TrafficSource>(source);
  sourceRef.current = source;

  // Le compteur initial peut arriver après le premier rendu (SSR → hydratation).
  useEffect(() => {
    setViewCount((current) => (current === 0 ? initialViewCount : current));
  }, [initialViewCount]);

  /** Construit le corps exact attendu par `watchHeartbeatSchema`. */
  const buildPayload = useCallback((): WatchHeartbeatInput | null => {
    if (!sessionIdRef.current) return null;
    const video = videoRef.current;
    const raw = video && Number.isFinite(video.currentTime) ? video.currentTime : NaN;
    const position = Number.isFinite(raw) ? raw : lastKnownPositionRef.current;
    return {
      videoId,
      sessionId: sessionIdRef.current,
      watchedSec: Math.max(0, Math.floor(watchedRef.current)),
      positionSec: Math.max(0, Math.floor(position)),
      source: sourceRef.current,
    };
  }, [videoId, videoRef]);

  const sendHeartbeat = useCallback(async () => {
    if (inFlightRef.current) return;
    const payload = buildPayload();
    if (!payload) return;

    inFlightRef.current = true;
    lastSentRef.current = watchedRef.current;
    try {
      const res = await api.post<HeartbeatResponse>(ROUTES.views.heartbeat, payload, {
        allowAnonymous: true,
      });
      if (typeof res?.viewCount === 'number') setViewCount(res.viewCount);
      if (res?.counted) setCounted(true);
    } catch (err) {
      // Silencieux en production : le comptage ne doit jamais gêner la lecture.
      if (isDev()) console.warn('[watch] heartbeat échoué', err);
    } finally {
      inFlightRef.current = false;
    }
  }, [buildPayload]);

  // ── Accumulation du temps réellement visionné ────────────────────────────
  useEffect(() => {
    if (!enabled) return;
    const video = videoRef.current;
    if (!video) return;

    sessionIdRef.current = getSessionId();
    watchedRef.current = 0;
    lastSentRef.current = 0;
    lastPosRef.current = null;
    setCounted(false);

    /** Suspend l'accumulation (pause, buffering, seek, onglet caché). */
    const suspend = () => {
      lastPosRef.current = null;
    };
    /** Reprend l'accumulation à la position courante. */
    const resume = () => {
      lastPosRef.current = video.currentTime;
    };

    const onTimeUpdate = () => {
      const previous = lastPosRef.current;
      const now = video.currentTime;
      if (Number.isFinite(now)) lastKnownPositionRef.current = now;

      // Conditions de lecture effective.
      if (
        video.paused ||
        video.seeking ||
        video.ended ||
        document.visibilityState === 'hidden' ||
        video.readyState < 2
      ) {
        lastPosRef.current = null;
        return;
      }

      lastPosRef.current = now;
      if (previous === null) return;

      const delta = now - previous;
      const rate = video.playbackRate > 0 ? video.playbackRate : 1;
      // `delta <= 0` : retour arrière. `delta` trop grand : saut avant.
      if (delta <= 0 || delta > MAX_TIMEUPDATE_DELTA * rate) return;

      watchedRef.current += delta;
      setWatchedSec(watchedRef.current);

      if (watchedRef.current - lastSentRef.current >= HEARTBEAT_INTERVAL_SEC) {
        void sendHeartbeat();
      }
    };

    const onVisibility = () => {
      if (document.visibilityState === 'hidden') suspend();
      else resume();
    };

    video.addEventListener('timeupdate', onTimeUpdate);
    video.addEventListener('playing', resume);
    video.addEventListener('seeked', resume);
    video.addEventListener('pause', suspend);
    video.addEventListener('waiting', suspend);
    video.addEventListener('seeking', suspend);
    video.addEventListener('ended', suspend);
    document.addEventListener('visibilitychange', onVisibility);

    return () => {
      video.removeEventListener('timeupdate', onTimeUpdate);
      video.removeEventListener('playing', resume);
      video.removeEventListener('seeked', resume);
      video.removeEventListener('pause', suspend);
      video.removeEventListener('waiting', suspend);
      video.removeEventListener('seeking', suspend);
      video.removeEventListener('ended', suspend);
      document.removeEventListener('visibilitychange', onVisibility);
    };
  }, [enabled, videoId, videoRef, sendHeartbeat]);

  // ── Dernier heartbeat au déchargement de la page ─────────────────────────
  useEffect(() => {
    if (!enabled) return;

    const flush = () => {
      // Rien de nouveau à signaler depuis le dernier ping.
      if (watchedRef.current - lastSentRef.current < 1) return;
      const payload = buildPayload();
      if (!payload) return;
      lastSentRef.current = watchedRef.current;

      const url = `${API_BASE}${ROUTES.views.heartbeat}`;
      const body = JSON.stringify(payload);
      let sent = false;
      try {
        if (typeof navigator !== 'undefined' && typeof navigator.sendBeacon === 'function') {
          sent = navigator.sendBeacon(url, new Blob([body], { type: 'application/json' }));
        }
      } catch {
        sent = false;
      }
      if (!sent) {
        // Repli : `keepalive` survit lui aussi au déchargement du document.
        void fetch(url, {
          method: 'POST',
          credentials: 'include',
          keepalive: true,
          headers: { 'Content-Type': 'application/json' },
          body,
        }).catch(() => undefined);
      }
    };

    window.addEventListener('pagehide', flush);
    window.addEventListener('beforeunload', flush);
    return () => {
      window.removeEventListener('pagehide', flush);
      window.removeEventListener('beforeunload', flush);
      // Démontage du lecteur (navigation SPA) : on remonte le reliquat.
      flush();
    };
  }, [enabled, buildPayload]);

  // ── Compteur en direct via WebSocket ─────────────────────────────────────
  const onRealtimeCount = useCallback(
    (data: unknown) => {
      if (typeof data !== 'object' || data === null) return;
      const payload = data as { videoId?: unknown; viewCount?: unknown };
      if (payload.videoId !== videoId) return;
      if (typeof payload.viewCount === 'number') setViewCount(payload.viewCount);
    },
    [videoId],
  );

  useRealtimeEvent(
    WS_EVENTS.viewCount,
    onRealtimeCount,
    enabled && realtime ? `video:${videoId}` : undefined,
  );

  return { viewCount, counted, watchedSec };
}
