'use client';

import { useCallback, useEffect, useRef, useState, type RefObject } from 'react';

/**
 * ═══════════════════════════════════════════════════════════════════════════
 *  PONT PAGE ↔ LECTEUR
 *  `VideoPlayer` n'expose pas d'API impérative : la page pilote la lecture en
 *  atteignant l'élément `<video>` rendu dans son conteneur. Toutes les
 *  opérations sont sans effet si le lecteur n'est pas (encore) monté.
 * ═══════════════════════════════════════════════════════════════════════════
 */

export interface PlayerBridge {
  /** Déplace la lecture à `seconds` et relance la vidéo. */
  seekTo: (seconds: number) => void;
  /** Position courante en secondes (0 si le lecteur n'est pas monté). */
  getCurrentTime: () => number;
}

function findVideoElement(
  container: HTMLElement | null,
): HTMLVideoElement | null {
  return container?.querySelector('video') ?? null;
}

export function usePlayerBridge(
  containerRef: RefObject<HTMLDivElement | null>,
): PlayerBridge {
  const getCurrentTime = useCallback(() => {
    const el = findVideoElement(containerRef.current);
    return el && Number.isFinite(el.currentTime) ? el.currentTime : 0;
  }, [containerRef]);

  const seekTo = useCallback(
    (seconds: number) => {
      const el = findVideoElement(containerRef.current);
      if (!el) return;
      el.currentTime = Math.max(0, seconds);
      void el.play().catch(() => undefined);
      // Ramène le lecteur dans le champ de vision (clic depuis un commentaire).
      if (typeof window !== 'undefined' && window.scrollY > 0) {
        window.scrollTo({ top: 0, behavior: 'smooth' });
      }
    },
    [containerRef],
  );

  return { seekTo, getCurrentTime };
}

/**
 * Position de lecture rafraîchie à intervalle régulier.
 * Utilisé pour surligner le chapitre courant sans re-rendre toute la page.
 */
export function usePlaybackPosition(
  containerRef: RefObject<HTMLDivElement | null>,
  intervalMs = 1000,
): number {
  const [position, setPosition] = useState(0);
  const lastRef = useRef(0);

  useEffect(() => {
    const tick = () => {
      const el = findVideoElement(containerRef.current);
      if (!el || !Number.isFinite(el.currentTime)) return;
      const next = Math.floor(el.currentTime);
      if (next === lastRef.current) return;
      lastRef.current = next;
      setPosition(next);
    };

    tick();
    const timer = window.setInterval(tick, intervalMs);
    return () => window.clearInterval(timer);
  }, [containerRef, intervalMs]);

  return position;
}
