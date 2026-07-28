'use client';

import clsx from 'clsx';
import { useCallback, useEffect, useRef, useState } from 'react';
import { LoaderCircle, Pause, Play, RefreshCw, TriangleAlert, Volume2, VolumeX } from 'lucide-react';
import { formatDuration, type VideoDetailDTO } from '@kelvyntube/shared';
import { useHlsPlayer } from '@/hooks/useHlsPlayer';
import { useWatchTracking } from '@/hooks/useWatchTracking';
import { clamp } from '@/lib/player-storage';

export interface ShortsPlayerProps {
  /** Vidéo complète : seule forme qui porte `hlsMasterUrl` / `mp4FallbackUrl`. */
  video: VideoDetailDTO;
  /** Le feed n'active qu'un Short à la fois : seul l'actif joue. */
  active: boolean;
  /** Sourdine contrôlée par le feed (partagée entre tous les Shorts). */
  muted?: boolean;
  onMutedChange?: (muted: boolean) => void;
  onViewCountChange?: (viewCount: number) => void;
  /** Appelé à chaque fin de boucle (compteur de replays côté page). */
  onLoop?: () => void;
  className?: string;
}

/**
 * Lecteur vertical plein écran pour les Shorts : 9:16, `object-cover`,
 * boucle infinie, démarrage muet (contrainte d'autoplay des navigateurs)
 * et bouton de réactivation du son bien visible.
 */
export function ShortsPlayer({
  video,
  active,
  muted: mutedProp,
  onMutedChange,
  onViewCountChange,
  onLoop,
  className,
}: ShortsPlayerProps) {
  const {
    videoRef,
    error: sourceError,
    retry,
  } = useHlsPlayer({
    hlsMasterUrl: video.hlsMasterUrl,
    mp4FallbackUrl: video.mp4FallbackUrl,
  });

  const { viewCount } = useWatchTracking({
    videoId: video.id,
    videoRef,
    source: 'SHORTS',
    initialViewCount: video.viewCount,
    enabled: active,
    realtime: active,
  });

  const [internalMuted, setInternalMuted] = useState(true);
  const muted = mutedProp ?? internalMuted;

  const [playing, setPlaying] = useState(false);
  const [buffering, setBuffering] = useState(false);
  const [currentTime, setCurrentTime] = useState(0);
  const [duration, setDuration] = useState(video.durationSec);
  /** Icône play/pause éphémère affichée au tap. */
  const [tapIcon, setTapIcon] = useState<{ id: number; playing: boolean } | null>(null);

  const tapTimerRef = useRef<ReturnType<typeof setTimeout> | null>(null);
  const trackRef = useRef<HTMLDivElement | null>(null);
  const draggingRef = useRef(false);
  const activeRef = useRef(active);
  activeRef.current = active;
  /** Vrai si l'utilisateur a explicitement mis en pause ce Short. */
  const userPausedRef = useRef(false);

  const setMuted = useCallback(
    (next: boolean) => {
      if (mutedProp === undefined) setInternalMuted(next);
      onMutedChange?.(next);
    },
    [mutedProp, onMutedChange],
  );

  // Callbacks du parent gardées en ref : le feed passe souvent des fonctions
  // anonymes, recréées à chaque rendu.
  const onViewCountChangeRef = useRef(onViewCountChange);
  onViewCountChangeRef.current = onViewCountChange;
  const onLoopRef = useRef(onLoop);
  onLoopRef.current = onLoop;

  useEffect(() => {
    onViewCountChangeRef.current?.(viewCount);
  }, [viewCount]);

  // Applique la sourdine à l'élément.
  useEffect(() => {
    const el = videoRef.current;
    if (el) el.muted = muted;
  }, [muted, videoRef]);

  // ── Lecture pilotée par `active` ─────────────────────────────────────────
  useEffect(() => {
    const el = videoRef.current;
    if (!el) return;
    if (active) {
      el.muted = muted;
      userPausedRef.current = false;
      void el.play().catch(() => undefined);
    } else {
      el.pause();
      // Remise à zéro : le Short repart du début quand on y revient.
      try {
        el.currentTime = 0;
      } catch {
        /* la source n'est pas encore prête */
      }
      setCurrentTime(0);
      setPlaying(false);
    }
    // `muted` volontairement hors dépendances : géré par l'effet ci-dessus.
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [active, videoRef, video.id]);

  // ── Écouteurs de l'élément ───────────────────────────────────────────────
  useEffect(() => {
    const el = videoRef.current;
    if (!el) return;

    const onPlay = () => setPlaying(true);
    const onPause = () => setPlaying(false);
    const onWaiting = () => setBuffering(true);
    const onPlaying = () => {
      setBuffering(false);
      setPlaying(true);
    };
    const onCanPlay = () => {
      setBuffering(false);
      // Le Short est devenu actif avant que la source soit prête : on relance.
      if (activeRef.current && el.paused && !userPausedRef.current) {
        void el.play().catch(() => undefined);
      }
    };
    const onTimeUpdate = () => {
      if (!draggingRef.current) setCurrentTime(el.currentTime);
    };
    const onDurationChange = () => {
      setDuration(
        Number.isFinite(el.duration) && el.duration > 0 ? el.duration : video.durationSec,
      );
    };
    const onSeeking = () => {
      // Fin de boucle : la vidéo revient à 0 toute seule.
      if (el.currentTime < 0.2 && el.loop) onLoopRef.current?.();
    };

    el.addEventListener('play', onPlay);
    el.addEventListener('pause', onPause);
    el.addEventListener('waiting', onWaiting);
    el.addEventListener('playing', onPlaying);
    el.addEventListener('canplay', onCanPlay);
    el.addEventListener('timeupdate', onTimeUpdate);
    el.addEventListener('durationchange', onDurationChange);
    el.addEventListener('loadedmetadata', onDurationChange);
    el.addEventListener('seeking', onSeeking);

    return () => {
      el.removeEventListener('play', onPlay);
      el.removeEventListener('pause', onPause);
      el.removeEventListener('waiting', onWaiting);
      el.removeEventListener('playing', onPlaying);
      el.removeEventListener('canplay', onCanPlay);
      el.removeEventListener('timeupdate', onTimeUpdate);
      el.removeEventListener('durationchange', onDurationChange);
      el.removeEventListener('loadedmetadata', onDurationChange);
      el.removeEventListener('seeking', onSeeking);
    };
  }, [video.durationSec, videoRef]);

  useEffect(
    () => () => {
      if (tapTimerRef.current) clearTimeout(tapTimerRef.current);
    },
    [],
  );

  const togglePlay = useCallback(() => {
    const el = videoRef.current;
    if (!el) return;
    const willPlay = el.paused;
    userPausedRef.current = !willPlay;
    if (willPlay) void el.play().catch(() => undefined);
    else el.pause();
    setTapIcon({ id: Date.now(), playing: willPlay });
    if (tapTimerRef.current) clearTimeout(tapTimerRef.current);
    tapTimerRef.current = setTimeout(() => setTapIcon(null), 500);
  }, [videoRef]);

  // ── Barre de progression fine ────────────────────────────────────────────
  const safeDuration = Number.isFinite(duration) && duration > 0 ? duration : 0;
  const progressPct = safeDuration > 0 ? (currentTime / safeDuration) * 100 : 0;

  const seekFromClientX = useCallback(
    (clientX: number) => {
      const track = trackRef.current;
      const el = videoRef.current;
      if (!track || !el || safeDuration <= 0) return;
      const rect = track.getBoundingClientRect();
      if (rect.width <= 0) return;
      const ratio = clamp((clientX - rect.left) / rect.width, 0, 1);
      el.currentTime = ratio * safeDuration;
      setCurrentTime(ratio * safeDuration);
    },
    [safeDuration, videoRef],
  );

  const onTrackPointerDown = useCallback(
    (event: React.PointerEvent<HTMLDivElement>) => {
      event.stopPropagation();
      event.preventDefault();
      event.currentTarget.setPointerCapture(event.pointerId);
      draggingRef.current = true;
      seekFromClientX(event.clientX);
    },
    [seekFromClientX],
  );

  const onTrackPointerMove = useCallback(
    (event: React.PointerEvent<HTMLDivElement>) => {
      if (!draggingRef.current) return;
      seekFromClientX(event.clientX);
    },
    [seekFromClientX],
  );

  const onTrackPointerUp = useCallback((event: React.PointerEvent<HTMLDivElement>) => {
    if (event.currentTarget.hasPointerCapture(event.pointerId)) {
      event.currentTarget.releasePointerCapture(event.pointerId);
    }
    draggingRef.current = false;
  }, []);

  const onTrackKeyDown = useCallback(
    (event: React.KeyboardEvent<HTMLDivElement>) => {
      const el = videoRef.current;
      if (!el || safeDuration <= 0) return;
      let next: number | null = null;
      if (event.key === 'ArrowLeft') next = el.currentTime - 5;
      else if (event.key === 'ArrowRight') next = el.currentTime + 5;
      else if (event.key === 'Home') next = 0;
      else if (event.key === 'End') next = safeDuration;
      else return;
      event.preventDefault();
      el.currentTime = clamp(next, 0, safeDuration);
      setCurrentTime(el.currentTime);
    },
    [safeDuration, videoRef],
  );

  return (
    <div
      className={clsx(
        'relative flex h-full w-full items-center justify-center overflow-hidden bg-black',
        className,
      )}
    >
      {/* Cadre 9:16 centré */}
      <div className="relative h-full w-full max-w-[calc(100vh*9/16)] overflow-hidden bg-black sm:rounded-kt">
        <video
          ref={videoRef}
          className="absolute inset-0 h-full w-full object-cover"
          poster={video.thumbnailUrl ?? undefined}
          playsInline
          loop
          muted={muted}
          preload="metadata"
          aria-label={video.title}
        />

        {/* Surface de tap : lecture / pause */}
        <button
          type="button"
          onClick={togglePlay}
          aria-label={playing ? 'Mettre en pause' : 'Lire'}
          className="absolute inset-0 z-10 h-full w-full cursor-pointer bg-transparent outline-none kt-focus-ring"
        />

        {/* Icône éphémère au tap */}
        {tapIcon ? (
          <div
            key={tapIcon.id}
            aria-hidden="true"
            className="pointer-events-none absolute inset-0 z-20 flex items-center justify-center"
          >
            <span className="flex h-16 w-16 animate-fade-in items-center justify-center rounded-full bg-black/60 text-white motion-reduce:animate-none">
              {tapIcon.playing ? (
                <Play className="ml-1 h-8 w-8 fill-current" aria-hidden="true" />
              ) : (
                <Pause className="h-8 w-8 fill-current" aria-hidden="true" />
              )}
            </span>
          </div>
        ) : null}

        {/* Chargement */}
        {buffering && !sourceError ? (
          <div
            className="pointer-events-none absolute inset-0 z-20 flex items-center justify-center"
            role="status"
            aria-live="polite"
          >
            <LoaderCircle
              className="h-10 w-10 animate-spin text-white/90 motion-reduce:animate-none"
              aria-hidden="true"
            />
            <span className="sr-only">Chargement…</span>
          </div>
        ) : null}

        {/* Réactivation du son */}
        {muted ? (
          <button
            type="button"
            onClick={() => setMuted(false)}
            aria-label="Activer le son"
            className="absolute left-1/2 top-4 z-30 flex h-11 -translate-x-1/2 items-center gap-2 rounded-pill bg-black/70 px-4 text-kt-base font-medium text-white backdrop-blur transition-opacity hover:opacity-90 kt-focus-ring"
          >
            <VolumeX className="h-5 w-5" aria-hidden="true" />
            Activer le son
          </button>
        ) : (
          <button
            type="button"
            onClick={() => setMuted(true)}
            aria-label="Couper le son"
            className="absolute right-3 top-4 z-30 flex h-11 w-11 items-center justify-center rounded-full bg-black/60 text-white backdrop-blur transition-opacity hover:opacity-90 kt-focus-ring"
          >
            <Volume2 className="h-5 w-5" aria-hidden="true" />
          </button>
        )}

        {/* Écran d'erreur */}
        {sourceError ? (
          <div className="absolute inset-0 z-40 flex flex-col items-center justify-center gap-3 bg-black/90 px-6 text-center">
            <TriangleAlert className="h-9 w-9 text-brand" aria-hidden="true" />
            <p className="text-kt-base text-white">{sourceError}</p>
            <button
              type="button"
              onClick={retry}
              className="inline-flex items-center gap-2 rounded-pill bg-white px-4 py-2 text-kt-base font-medium text-black kt-focus-ring"
            >
              <RefreshCw className="h-4 w-4" aria-hidden="true" />
              Réessayer
            </button>
          </div>
        ) : null}

        {/* Barre de progression fine */}
        <div
          ref={trackRef}
          role="slider"
          tabIndex={0}
          aria-label="Progression du Short"
          aria-valuemin={0}
          aria-valuemax={Math.round(safeDuration)}
          aria-valuenow={Math.round(currentTime)}
          aria-valuetext={`${formatDuration(currentTime)} sur ${formatDuration(safeDuration)}`}
          aria-orientation="horizontal"
          onPointerDown={onTrackPointerDown}
          onPointerMove={onTrackPointerMove}
          onPointerUp={onTrackPointerUp}
          onPointerCancel={onTrackPointerUp}
          onKeyDown={onTrackKeyDown}
          className="absolute inset-x-0 bottom-0 z-30 h-4 cursor-pointer touch-none outline-none kt-focus-ring"
        >
          <span className="absolute inset-x-0 bottom-[2px] h-[3px] bg-white/25" />
          <span
            className="absolute bottom-[2px] left-0 h-[3px] bg-white"
            style={{ width: `${clamp(progressPct, 0, 100)}%` }}
          />
        </div>
      </div>
    </div>
  );
}

export default ShortsPlayer;
