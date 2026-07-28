'use client';

import { useCallback, useEffect, useRef, useState, type RefObject } from 'react';
// Imports de TYPE uniquement : `hls.js` n'entre jamais dans le bundle initial,
// il est chargé dynamiquement (`await import`) au moment d'attacher une source.
import type HlsJs from 'hls.js';
import type { ErrorData, Level } from 'hls.js';

export type VideoElementRef = RefObject<HTMLVideoElement | null>;

/** Niveau de qualité exposé à l'interface (menu réglages). */
export interface PlayerLevel {
  /** Index dans `hls.levels` (à repasser tel quel à `setLevel`). */
  index: number;
  width: number;
  height: number;
  bitrateKbps: number;
  /** Libellé affiché : « 1080p ». */
  label: string;
}

export interface UseHlsPlayerOptions {
  /** Playlist HLS maître ; `null` si la vidéo n'a pas encore été transcodée. */
  hlsMasterUrl: string | null;
  /** Repli MP4 progressif — seul format présent dans les données de démo. */
  mp4FallbackUrl: string | null;
  /** Hauteur préférée restaurée des préférences (`null` = automatique). */
  preferredHeight?: number | null;
}

export interface UseHlsPlayerResult {
  videoRef: VideoElementRef;
  /** Niveaux disponibles, du plus défini au moins défini. */
  levels: PlayerLevel[];
  /** Niveau demandé : `-1` signifie « automatique ». */
  currentLevel: number;
  /** Change le niveau ; `-1` réactive l'automatique. */
  setLevel: (index: number) => void;
  isAuto: boolean;
  /** Hauteur réellement jouée — sert à afficher « Auto (720p) ». */
  activeHeight: number | null;
  /** Message d'erreur si aucune source n'est lisible. */
  error: string | null;
  /** Relance complètement l'attachement de la source. */
  retry: () => void;
  /** Vrai si la lecture passe par hls.js (et non par un MP4 progressif). */
  usingHls: boolean;
}

/** Nombre de tentatives de récupération avant de basculer sur le MP4. */
const MAX_NETWORK_RECOVERIES = 3;
const MAX_MEDIA_RECOVERIES = 2;

const NO_SOURCE_MESSAGE = "Cette vidéo n'a pas de source lisible pour le moment.";
const UNREADABLE_MESSAGE = 'Impossible de lire cette vidéo. Vérifie ta connexion.';

function toPlayerLevels(levels: Level[]): PlayerLevel[] {
  return levels
    .map((level, index) => ({
      index,
      width: level.width,
      height: level.height,
      bitrateKbps: Math.round((level.bitrate || 0) / 1000),
      label: level.height > 0 ? `${level.height}p` : `${Math.round((level.bitrate || 0) / 1000)} kb/s`,
    }))
    .sort((a, b) => b.height - a.height || b.bitrateKbps - a.bitrateKbps);
}

/**
 * Branche une source vidéo sur un `<video>` :
 *  1. HLS via hls.js (Chrome, Firefox, Edge) ;
 *  2. HLS natif (Safari / iOS) ;
 *  3. MP4 progressif en repli — cas des données de démonstration.
 */
export function useHlsPlayer({
  hlsMasterUrl,
  mp4FallbackUrl,
  preferredHeight = null,
}: UseHlsPlayerOptions): UseHlsPlayerResult {
  const videoRef = useRef<HTMLVideoElement | null>(null);
  const hlsRef = useRef<HlsJs | null>(null);
  /** Mode courant : permet de savoir qui doit traiter l'événement `error`. */
  const modeRef = useRef<'hls' | 'native' | 'mp4' | null>(null);
  /** Hauteur préférée dans une ref : ne doit pas relancer l'attachement. */
  const preferredHeightRef = useRef<number | null>(preferredHeight);
  preferredHeightRef.current = preferredHeight;

  const [levels, setLevels] = useState<PlayerLevel[]>([]);
  const [currentLevel, setCurrentLevel] = useState(-1);
  const [activeHeight, setActiveHeight] = useState<number | null>(null);
  const [error, setError] = useState<string | null>(null);
  const [usingHls, setUsingHls] = useState(false);
  const [attempt, setAttempt] = useState(0);

  const retry = useCallback(() => {
    setError(null);
    setAttempt((n) => n + 1);
  }, []);

  useEffect(() => {
    const video = videoRef.current;
    if (!video) return;

    let cancelled = false;
    let networkRecoveries = 0;
    let mediaRecoveries = 0;

    setError(null);
    setLevels([]);
    setCurrentLevel(-1);
    setActiveHeight(null);
    setUsingHls(false);
    modeRef.current = null;

    /** Erreur native du `<video>` : seulement pertinente hors hls.js. */
    const onNativeError = () => {
      if (cancelled || modeRef.current === 'hls') return;
      // Le HLS natif peut échouer : on tente encore le MP4.
      if (modeRef.current === 'native' && mp4FallbackUrl) {
        attachMp4();
        return;
      }
      setError(UNREADABLE_MESSAGE);
    };

    function attachMp4() {
      if (cancelled) return;
      if (!mp4FallbackUrl) {
        setError(NO_SOURCE_MESSAGE);
        return;
      }
      const el = videoRef.current;
      if (!el) return;
      modeRef.current = 'mp4';
      setUsingHls(false);
      setLevels([]);
      setCurrentLevel(-1);
      el.src = mp4FallbackUrl;
      el.load();
    }

    /** Bascule définitive de hls.js vers le MP4 progressif. */
    function degradeToMp4() {
      hlsRef.current?.destroy();
      hlsRef.current = null;
      if (mp4FallbackUrl) attachMp4();
      else if (!cancelled) setError(UNREADABLE_MESSAGE);
    }

    const setup = async () => {
      // ── Aucune playlist HLS : MP4 direct (données de démonstration) ────
      if (!hlsMasterUrl) {
        attachMp4();
        return;
      }

      // ── Support HLS natif (Safari, iOS) ───────────────────────────────
      const nativeHls = video.canPlayType('application/vnd.apple.mpegurl');
      if (nativeHls === 'probably' || nativeHls === 'maybe') {
        modeRef.current = 'native';
        setUsingHls(true);
        video.src = hlsMasterUrl;
        video.load();
        return;
      }

      // ── hls.js (Media Source Extensions) ──────────────────────────────
      try {
        const { default: Hls } = await import('hls.js');
        if (cancelled) return;

        if (Hls.isSupported()) {
          const instance = new Hls({
            enableWorker: true,
            lowLatencyMode: false,
            backBufferLength: 90,
            capLevelToPlayerSize: true,
          });
          hlsRef.current = instance;
          modeRef.current = 'hls';
          setUsingHls(true);

          instance.on(Hls.Events.MANIFEST_PARSED, () => {
            if (cancelled) return;
            const parsed = toPlayerLevels(instance.levels);
            setLevels(parsed);
            // Restaure la qualité préférée si elle existe dans ce manifeste.
            const wanted = preferredHeightRef.current;
            if (wanted != null) {
              const match = parsed.find((l) => l.height === wanted);
              if (match) {
                instance.currentLevel = match.index;
                setCurrentLevel(match.index);
              }
            }
          });

          instance.on(Hls.Events.LEVEL_SWITCHED, (_event, data) => {
            if (cancelled) return;
            const level = instance.levels[data.level];
            setActiveHeight(level ? level.height : null);
          });

          instance.on(Hls.Events.ERROR, (_event, data: ErrorData) => {
            if (cancelled || !data.fatal) return;
            switch (data.type) {
              case Hls.ErrorTypes.NETWORK_ERROR:
                if (networkRecoveries < MAX_NETWORK_RECOVERIES) {
                  networkRecoveries += 1;
                  instance.startLoad();
                } else {
                  degradeToMp4();
                }
                break;
              case Hls.ErrorTypes.MEDIA_ERROR:
                if (mediaRecoveries < MAX_MEDIA_RECOVERIES) {
                  mediaRecoveries += 1;
                  instance.recoverMediaError();
                } else {
                  degradeToMp4();
                }
                break;
              default:
                degradeToMp4();
            }
          });

          instance.loadSource(hlsMasterUrl);
          instance.attachMedia(video);
          return;
        }
      } catch {
        // Chargement du module impossible : on continue vers le MP4.
      }

      if (cancelled) return;
      attachMp4();
    };

    video.addEventListener('error', onNativeError);
    void setup();

    return () => {
      cancelled = true;
      video.removeEventListener('error', onNativeError);
      hlsRef.current?.destroy();
      hlsRef.current = null;
      modeRef.current = null;
      // Coupe le téléchargement en cours pour libérer la bande passante.
      video.removeAttribute('src');
      try {
        video.load();
      } catch {
        /* certains navigateurs lèvent si l'élément est déjà détaché */
      }
    };
  }, [hlsMasterUrl, mp4FallbackUrl, attempt]);

  const setLevel = useCallback((index: number) => {
    setCurrentLevel(index);
    const instance = hlsRef.current;
    if (instance) instance.currentLevel = index;
  }, []);

  return {
    videoRef,
    levels,
    currentLevel,
    setLevel,
    isAuto: currentLevel === -1,
    activeHeight,
    error,
    retry,
    usingHls,
  };
}
