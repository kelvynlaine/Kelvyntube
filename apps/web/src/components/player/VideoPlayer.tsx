'use client';

import clsx from 'clsx';
import { useCallback, useEffect, useMemo, useRef, useState } from 'react';
import {
  Captions,
  CaptionsOff,
  FastForward,
  Gauge,
  LoaderCircle,
  Maximize,
  Pause,
  PictureInPicture2,
  Play,
  RectangleHorizontal,
  RefreshCw,
  Rewind,
  TriangleAlert,
  Volume2,
  VolumeX,
} from 'lucide-react';
import type { TrafficSource, VideoDetailDTO } from '@kelvyntube/shared';
import { useMediaQuery } from '@kelvyntube/ui';
import { useHlsPlayer } from '@/hooks/useHlsPlayer';
import { useWatchTracking } from '@/hooks/useWatchTracking';
import { usePlayerKeyboard, type PlayerFeedback } from '@/hooks/usePlayerKeyboard';
import {
  PLAYBACK_RATES,
  clamp,
  readPlayerPreferences,
  writePlayerPreferences,
} from '@/lib/player-storage';
import { CaptionsRenderer } from './CaptionsRenderer';
import { PlayerControls } from './PlayerControls';
import { ProgressBar } from './ProgressBar';
import { SettingsMenu } from './SettingsMenu';
import type { BufferedRange } from './ChapterMarkers';

export interface VideoPlayerProps {
  video: VideoDetailDTO;
  /** Provenance du visionnage (analytics). */
  source?: TrafficSource;
  autoPlay?: boolean;
  /** Reprise de lecture (secondes). */
  startAt?: number;
  theaterMode?: boolean;
  onTheaterToggle?: () => void;
  onEnded?: () => void;
  /** Vidéo suivante (playlist / file d'attente). */
  onNext?: () => void;
  onViewCountChange?: (viewCount: number) => void;
  className?: string;
}

/** Délai avant masquage automatique des contrôles (ms). */
const CONTROLS_HIDE_MS = 3000;
/** Fenêtre de détection du double-tap (ms). */
const DOUBLE_TAP_MS = 300;
/** Pas de saut du double-tap (secondes). */
const DOUBLE_TAP_SEEK = 10;

// ── Compatibilité plein écran (préfixes WebKit) ────────────────────────────

interface FullscreenElement extends HTMLElement {
  webkitRequestFullscreen?: () => Promise<void> | void;
}
interface FullscreenDocument extends Document {
  webkitFullscreenElement?: Element | null;
  webkitExitFullscreen?: () => Promise<void> | void;
}

function currentFullscreenElement(): Element | null {
  if (typeof document === 'undefined') return null;
  const doc = document as FullscreenDocument;
  return doc.fullscreenElement ?? doc.webkitFullscreenElement ?? null;
}

/** « 1.5 » → « 1,5× » ; 1 → « Normale ». */
function formatRate(rate: number): string {
  return rate === 1 ? 'Normale' : `${rate.toString().replace('.', ',')}×`;
}

/** Icône du retour visuel central. */
function FeedbackIcon({ kind }: { kind: PlayerFeedback['kind'] }) {
  const className = 'h-8 w-8';
  switch (kind) {
    case 'play':
      return <Play className={className} aria-hidden="true" />;
    case 'pause':
      return <Pause className={className} aria-hidden="true" />;
    case 'forward':
      return <FastForward className={className} aria-hidden="true" />;
    case 'backward':
      return <Rewind className={className} aria-hidden="true" />;
    case 'volume':
      return <Volume2 className={className} aria-hidden="true" />;
    case 'mute':
      return <VolumeX className={className} aria-hidden="true" />;
    case 'unmute':
      return <Volume2 className={className} aria-hidden="true" />;
    case 'speed':
      return <Gauge className={className} aria-hidden="true" />;
    case 'frame':
      return <FastForward className={className} aria-hidden="true" />;
    case 'captions':
      return <Captions className={className} aria-hidden="true" />;
    case 'captions-off':
      return <CaptionsOff className={className} aria-hidden="true" />;
    case 'fullscreen':
      return <Maximize className={className} aria-hidden="true" />;
    case 'theater':
      return <RectangleHorizontal className={className} aria-hidden="true" />;
    case 'pip':
      return <PictureInPicture2 className={className} aria-hidden="true" />;
    default:
      return null;
  }
}

/**
 * ═══════════════════════════════════════════════════════════════════════════
 *  LECTEUR VIDÉO KELVYN TUBE
 *  HLS (hls.js / natif) avec repli MP4, contrôles personnalisés, chapitres,
 *  sous-titres, qualité, vitesse, PiP, mode théâtre, plein écran,
 *  raccourcis clavier et comptage de vues.
 * ═══════════════════════════════════════════════════════════════════════════
 */
export function VideoPlayer({
  video,
  source = 'DIRECT',
  autoPlay = false,
  startAt = 0,
  theaterMode = false,
  onTheaterToggle,
  onEnded: onEndedProp,
  onNext,
  onViewCountChange,
  className,
}: VideoPlayerProps) {
  const containerRef = useRef<HTMLDivElement | null>(null);
  const settingsButtonRef = useRef<HTMLButtonElement | null>(null);

  const [preferredHeight, setPreferredHeight] = useState<number | null>(null);

  const {
    videoRef,
    levels,
    currentLevel,
    setLevel,
    activeHeight,
    error: sourceError,
    retry,
  } = useHlsPlayer({
    hlsMasterUrl: video.hlsMasterUrl,
    mp4FallbackUrl: video.mp4FallbackUrl,
    preferredHeight,
  });

  const { viewCount } = useWatchTracking({
    videoId: video.id,
    videoRef,
    source,
    initialViewCount: video.viewCount,
  });

  // ── État de lecture ─────────────────────────────────────────────────────
  const [playing, setPlaying] = useState(false);
  const [ended, setEnded] = useState(false);
  const [started, setStarted] = useState(false);
  const [buffering, setBuffering] = useState(false);
  const [currentTime, setCurrentTime] = useState(startAt);
  const [duration, setDuration] = useState(video.durationSec);
  const [buffered, setBuffered] = useState<BufferedRange[]>([]);

  // ── Préférences ─────────────────────────────────────────────────────────
  const [volume, setVolume] = useState(1);
  const [muted, setMuted] = useState(false);
  const [playbackRate, setPlaybackRate] = useState(1);
  const [captionLang, setCaptionLang] = useState<string | null>(null);

  // ── Interface ───────────────────────────────────────────────────────────
  const [controlsVisible, setControlsVisible] = useState(true);
  const [settingsOpen, setSettingsOpen] = useState(false);
  const [isFullscreen, setIsFullscreen] = useState(false);
  const [pipSupported, setPipSupported] = useState(false);
  const [pipActive, setPipActive] = useState(false);
  const [tapRipple, setTapRipple] = useState<{ id: number; side: 'left' | 'right' } | null>(null);

  // Refs miroir : lues dans des callbacks stables (timers, écouteurs natifs).
  const playingRef = useRef(false);
  const scrubbingRef = useRef(false);
  const settingsOpenRef = useRef(false);
  const hideTimerRef = useRef<ReturnType<typeof setTimeout> | null>(null);
  const rippleTimerRef = useRef<ReturnType<typeof setTimeout> | null>(null);
  const singleTapTimerRef = useRef<ReturnType<typeof setTimeout> | null>(null);
  const lastTapRef = useRef<{ at: number; side: 'left' | 'right' } | null>(null);
  const lastPointerTypeRef = useRef<string>('mouse');
  /** Instant de fermeture du menu réglages (évite un play/pause parasite). */
  const settingsClosedAtRef = useRef(0);
  const startAppliedRef = useRef(false);
  const bufferedKeyRef = useRef('');
  /** Indirection vers `showFeedback` (défini plus bas par le hook clavier). */
  const feedbackFnRef = useRef<(kind: PlayerFeedback['kind'], label?: string) => void>(
    () => undefined,
  );

  playingRef.current = playing;
  settingsOpenRef.current = settingsOpen;

  const hasCaptions = video.captions.length > 0;

  // Callbacks du parent gardées en ref : évite de relancer les effets quand
  // la page passe une fonction anonyme (recréée à chaque rendu).
  const onViewCountChangeRef = useRef(onViewCountChange);
  onViewCountChangeRef.current = onViewCountChange;
  const captionsRef = useRef(video.captions);
  captionsRef.current = video.captions;
  const onEndedRef = useRef(onEndedProp);
  onEndedRef.current = onEndedProp;
  const autoPlayRef = useRef(autoPlay);
  autoPlayRef.current = autoPlay;
  const startAtRef = useRef(startAt);
  startAtRef.current = startAt;

  // ── Restauration des préférences (client uniquement) ─────────────────────
  useEffect(() => {
    const prefs = readPlayerPreferences();
    setVolume(prefs.volume);
    setMuted(prefs.muted);
    setPlaybackRate(prefs.playbackRate);
    setPreferredHeight(prefs.qualityHeight);
    if (
      prefs.captionsLang &&
      captionsRef.current.some((c) => c.language === prefs.captionsLang)
    ) {
      setCaptionLang(prefs.captionsLang);
    }
  }, [video.id]);

  // Applique volume / sourdine / vitesse à l'élément vidéo.
  useEffect(() => {
    const el = videoRef.current;
    if (!el) return;
    el.volume = clamp(volume, 0, 1);
    el.muted = muted;
  }, [muted, videoRef, volume]);

  useEffect(() => {
    const el = videoRef.current;
    if (!el) return;
    el.playbackRate = playbackRate;
  }, [playbackRate, videoRef]);

  // Remonte le compteur de vues à la page.
  useEffect(() => {
    onViewCountChangeRef.current?.(viewCount);
  }, [viewCount]);

  // ── Écouteurs de l'élément vidéo ─────────────────────────────────────────
  useEffect(() => {
    const el = videoRef.current;
    if (!el) return;

    const syncBuffered = () => {
      const ranges: BufferedRange[] = [];
      for (let i = 0; i < el.buffered.length; i += 1) {
        ranges.push([el.buffered.start(i), el.buffered.end(i)]);
      }
      // Évite un rendu inutile quand les plages n'ont pas bougé.
      const key = ranges.map(([s, e]) => `${s.toFixed(1)}-${e.toFixed(1)}`).join('|');
      if (key === bufferedKeyRef.current) return;
      bufferedKeyRef.current = key;
      setBuffered(ranges);
    };

    const syncDuration = () => {
      setDuration(Number.isFinite(el.duration) && el.duration > 0 ? el.duration : video.durationSec);
    };

    const onLoadedMetadata = () => {
      syncDuration();
      // Reprise de lecture : une seule fois par source.
      if (!startAppliedRef.current) {
        startAppliedRef.current = true;
        const target = Number.isFinite(startAtRef.current) ? startAtRef.current : 0;
        const max = Number.isFinite(el.duration) ? el.duration : video.durationSec;
        if (target > 0 && target < max - 2) {
          el.currentTime = target;
          setCurrentTime(target);
        }
        if (autoPlayRef.current) void el.play().catch(() => undefined);
      }
    };

    const onPlay = () => {
      setPlaying(true);
      setEnded(false);
      setStarted(true);
    };
    const onPlaying = () => {
      setPlaying(true);
      setBuffering(false);
      setStarted(true);
    };
    const onPause = () => setPlaying(false);
    const onWaiting = () => setBuffering(true);
    const onCanPlay = () => setBuffering(false);
    const onTimeUpdate = () => {
      if (!scrubbingRef.current) setCurrentTime(el.currentTime);
      syncBuffered();
    };
    const onSeeked = () => setCurrentTime(el.currentTime);
    const onEndedEvent = () => {
      setPlaying(false);
      setEnded(true);
      setControlsVisible(true);
      onEndedRef.current?.();
    };
    const onVolumeEvent = () => {
      setVolume(el.volume);
      setMuted(el.muted);
    };
    const onRateEvent = () => setPlaybackRate(el.playbackRate);
    const onEnterPip = () => setPipActive(true);
    const onLeavePip = () => setPipActive(false);

    el.addEventListener('loadedmetadata', onLoadedMetadata);
    el.addEventListener('durationchange', syncDuration);
    el.addEventListener('play', onPlay);
    el.addEventListener('playing', onPlaying);
    el.addEventListener('pause', onPause);
    el.addEventListener('waiting', onWaiting);
    el.addEventListener('canplay', onCanPlay);
    el.addEventListener('timeupdate', onTimeUpdate);
    el.addEventListener('progress', syncBuffered);
    el.addEventListener('seeked', onSeeked);
    el.addEventListener('ended', onEndedEvent);
    el.addEventListener('volumechange', onVolumeEvent);
    el.addEventListener('ratechange', onRateEvent);
    el.addEventListener('enterpictureinpicture', onEnterPip);
    el.addEventListener('leavepictureinpicture', onLeavePip);

    return () => {
      el.removeEventListener('loadedmetadata', onLoadedMetadata);
      el.removeEventListener('durationchange', syncDuration);
      el.removeEventListener('play', onPlay);
      el.removeEventListener('playing', onPlaying);
      el.removeEventListener('pause', onPause);
      el.removeEventListener('waiting', onWaiting);
      el.removeEventListener('canplay', onCanPlay);
      el.removeEventListener('timeupdate', onTimeUpdate);
      el.removeEventListener('progress', syncBuffered);
      el.removeEventListener('seeked', onSeeked);
      el.removeEventListener('ended', onEndedEvent);
      el.removeEventListener('volumechange', onVolumeEvent);
      el.removeEventListener('ratechange', onRateEvent);
      el.removeEventListener('enterpictureinpicture', onEnterPip);
      el.removeEventListener('leavepictureinpicture', onLeavePip);
    };
  }, [video.durationSec, videoRef]);

  // Nouvelle vidéo : on réarme la reprise de lecture.
  useEffect(() => {
    startAppliedRef.current = false;
    setStarted(false);
    setEnded(false);
    setCurrentTime(startAt);
    setDuration(video.durationSec);
    setBuffered([]);
    bufferedKeyRef.current = '';
    // `startAt` volontairement hors dépendances : seule la vidéo réarme.
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [video.id]);

  // ── Plein écran & PiP ────────────────────────────────────────────────────
  useEffect(() => {
    setPipSupported(
      typeof document !== 'undefined' &&
        document.pictureInPictureEnabled === true &&
        videoRef.current?.disablePictureInPicture !== true,
    );
  }, [videoRef]);

  useEffect(() => {
    const onChange = () => setIsFullscreen(currentFullscreenElement() === containerRef.current);
    document.addEventListener('fullscreenchange', onChange);
    document.addEventListener('webkitfullscreenchange', onChange);
    return () => {
      document.removeEventListener('fullscreenchange', onChange);
      document.removeEventListener('webkitfullscreenchange', onChange);
    };
  }, []);

  // ── Actions ──────────────────────────────────────────────────────────────
  const revealControls = useCallback(() => {
    setControlsVisible(true);
    if (hideTimerRef.current) clearTimeout(hideTimerRef.current);
    hideTimerRef.current = setTimeout(() => {
      if (playingRef.current && !settingsOpenRef.current && !scrubbingRef.current) {
        setControlsVisible(false);
      }
    }, CONTROLS_HIDE_MS);
  }, []);

  // Contrôles toujours visibles en pause / menu ouvert.
  useEffect(() => {
    if (!playing || settingsOpen) {
      if (hideTimerRef.current) clearTimeout(hideTimerRef.current);
      setControlsVisible(true);
    } else {
      revealControls();
    }
  }, [playing, revealControls, settingsOpen]);

  // Nettoyage des timers au démontage.
  useEffect(
    () => () => {
      if (hideTimerRef.current) clearTimeout(hideTimerRef.current);
      if (rippleTimerRef.current) clearTimeout(rippleTimerRef.current);
      if (singleTapTimerRef.current) clearTimeout(singleTapTimerRef.current);
    },
    [],
  );

  const togglePlay = useCallback(() => {
    const el = videoRef.current;
    if (!el) return;
    if (el.paused || el.ended) {
      void el.play().catch(() => undefined);
    } else {
      el.pause();
    }
  }, [videoRef]);

  const seekTo = useCallback(
    (time: number) => {
      const el = videoRef.current;
      if (!el) return;
      const max = Number.isFinite(el.duration) && el.duration > 0 ? el.duration : duration;
      const next = clamp(time, 0, Math.max(0, max));
      el.currentTime = next;
      setCurrentTime(next);
    },
    [duration, videoRef],
  );

  const seekBy = useCallback(
    (seconds: number) => {
      const el = videoRef.current;
      if (!el) return;
      seekTo(el.currentTime + seconds);
    },
    [seekTo, videoRef],
  );

  const seekToRatio = useCallback(
    (ratio: number) => {
      const el = videoRef.current;
      const max = el && Number.isFinite(el.duration) && el.duration > 0 ? el.duration : duration;
      seekTo(clamp(ratio, 0, 1) * max);
    },
    [duration, seekTo, videoRef],
  );

  const changeVolume = useCallback((next: number) => {
    const value = clamp(next, 0, 1);
    setVolume(value);
    setMuted(value === 0);
    writePlayerPreferences({ volume: value, muted: value === 0 });
  }, []);

  const toggleMute = useCallback(() => {
    setMuted((current) => {
      const next = !current;
      writePlayerPreferences({ muted: next });
      return next;
    });
  }, []);

  const changeRate = useCallback((rate: number) => {
    setPlaybackRate(rate);
    writePlayerPreferences({ playbackRate: rate });
  }, []);

  const changeLevel = useCallback(
    (index: number) => {
      setLevel(index);
      const height = index === -1 ? null : (levels.find((l) => l.index === index)?.height ?? null);
      setPreferredHeight(height);
      writePlayerPreferences({ qualityHeight: height });
    },
    [levels, setLevel],
  );

  const changeCaptions = useCallback((language: string | null) => {
    setCaptionLang(language);
    writePlayerPreferences({ captionsLang: language });
  }, []);

  const toggleCaptions = useCallback(() => {
    if (!hasCaptions) return;
    changeCaptions(captionLang === null ? video.captions[0].language : null);
  }, [captionLang, changeCaptions, hasCaptions, video.captions]);

  const toggleFullscreen = useCallback(() => {
    const container = containerRef.current as FullscreenElement | null;
    if (!container) return;
    const doc = document as FullscreenDocument;
    try {
      if (currentFullscreenElement()) {
        const exit = doc.exitFullscreen?.bind(doc) ?? doc.webkitExitFullscreen?.bind(doc);
        void Promise.resolve(exit?.()).catch(() => undefined);
      } else {
        const request =
          container.requestFullscreen?.bind(container) ??
          container.webkitRequestFullscreen?.bind(container);
        void Promise.resolve(request?.()).catch(() => undefined);
      }
    } catch {
      /* plein écran refusé par le navigateur */
    }
  }, []);

  const togglePip = useCallback(() => {
    const el = videoRef.current;
    if (!el || !pipSupported) return;
    try {
      if (document.pictureInPictureElement) {
        void document.exitPictureInPicture().catch(() => undefined);
      } else {
        void el.requestPictureInPicture().catch(() => undefined);
      }
    } catch {
      /* PiP indisponible */
    }
  }, [pipSupported, videoRef]);

  const handleTheaterToggle = useCallback(() => {
    if (!onTheaterToggle) return;
    writePlayerPreferences({ theaterMode: !theaterMode });
    onTheaterToggle();
  }, [onTheaterToggle, theaterMode]);

  const stepFrame = useCallback(
    (direction: 1 | -1) => {
      const el = videoRef.current;
      if (!el) return;
      if (!el.paused) el.pause();
      seekTo(el.currentTime + direction / 30);
    },
    [seekTo, videoRef],
  );

  const stepRate = useCallback(
    (direction: 1 | -1) => {
      const index = PLAYBACK_RATES.findIndex((r) => Math.abs(r - playbackRate) < 0.001);
      const next = clamp(
        (index === -1 ? PLAYBACK_RATES.indexOf(1) : index) + direction,
        0,
        PLAYBACK_RATES.length - 1,
      );
      changeRate(PLAYBACK_RATES[next]);
    },
    [changeRate, playbackRate],
  );

  // ── Raccourcis clavier + retour visuel ───────────────────────────────────
  // `notify` est une indirection stable : les actions sont mémoïsées AVANT
  // que le hook n'expose `showFeedback` (référence circulaire sinon).
  const notify = useCallback((kind: PlayerFeedback['kind'], label?: string) => {
    feedbackFnRef.current(kind, label);
  }, []);

  const keyboardActions = useMemo(
    () => ({
      togglePlay: () => {
        const el = videoRef.current;
        const willPlay = !el || el.paused || el.ended;
        togglePlay();
        notify(willPlay ? 'play' : 'pause');
      },
      seekBy,
      seekToRatio,
      adjustVolume: (delta: number) => {
        const next = clamp((muted ? 0 : volume) + delta, 0, 1);
        changeVolume(next);
        notify('volume', `${Math.round(next * 100)} %`);
      },
      toggleMute: () => {
        toggleMute();
        notify(muted ? 'unmute' : 'mute');
      },
      toggleFullscreen,
      toggleTheater: onTheaterToggle ? handleTheaterToggle : undefined,
      togglePip: pipSupported ? togglePip : undefined,
      toggleCaptions: hasCaptions
        ? () => {
            toggleCaptions();
            notify(captionLang === null ? 'captions' : 'captions-off');
          }
        : undefined,
      stepFrame: (direction: 1 | -1) => {
        stepFrame(direction);
        notify('frame', direction > 0 ? 'Image suivante' : 'Image précédente');
      },
      stepRate: (direction: 1 | -1) => {
        const index = PLAYBACK_RATES.findIndex((r) => Math.abs(r - playbackRate) < 0.001);
        const next = clamp(
          (index === -1 ? PLAYBACK_RATES.indexOf(1) : index) + direction,
          0,
          PLAYBACK_RATES.length - 1,
        );
        stepRate(direction);
        notify('speed', formatRate(PLAYBACK_RATES[next]));
      },
    }),
    [
      captionLang,
      changeVolume,
      handleTheaterToggle,
      hasCaptions,
      muted,
      notify,
      onTheaterToggle,
      pipSupported,
      playbackRate,
      seekBy,
      seekToRatio,
      stepFrame,
      stepRate,
      toggleCaptions,
      toggleFullscreen,
      toggleMute,
      togglePip,
      togglePlay,
      videoRef,
      volume,
    ],
  );

  const { feedback, showFeedback } = usePlayerKeyboard({
    containerRef,
    actions: keyboardActions,
  });
  // Branche l'indirection sur la vraie fonction (même motif que `actionsRef`).
  feedbackFnRef.current = showFeedback;

  // ── Gestes tactiles (double-tap ±10 s) ───────────────────────────────────
  const triggerRipple = useCallback((side: 'left' | 'right') => {
    setTapRipple({ id: Date.now(), side });
    if (rippleTimerRef.current) clearTimeout(rippleTimerRef.current);
    rippleTimerRef.current = setTimeout(() => setTapRipple(null), 500);
  }, []);

  const handleSurfacePointerDown = useCallback(
    (event: React.PointerEvent<HTMLDivElement>) => {
      lastPointerTypeRef.current = event.pointerType;
      if (event.pointerType !== 'touch') return;

      const rect = event.currentTarget.getBoundingClientRect();
      const side: 'left' | 'right' =
        event.clientX - rect.left < rect.width / 2 ? 'left' : 'right';
      const now = Date.now();
      const previous = lastTapRef.current;

      if (previous && now - previous.at < DOUBLE_TAP_MS && previous.side === side) {
        // Double-tap : saut de ±10 s.
        if (singleTapTimerRef.current) clearTimeout(singleTapTimerRef.current);
        lastTapRef.current = null;
        seekBy(side === 'left' ? -DOUBLE_TAP_SEEK : DOUBLE_TAP_SEEK);
        triggerRipple(side);
        showFeedback(side === 'left' ? 'backward' : 'forward', `${DOUBLE_TAP_SEEK} s`);
        return;
      }

      lastTapRef.current = { at: now, side };
      if (singleTapTimerRef.current) clearTimeout(singleTapTimerRef.current);
      singleTapTimerRef.current = setTimeout(() => {
        // Tap simple : bascule l'affichage des contrôles.
        setControlsVisible((visible) => {
          if (visible && playingRef.current) return false;
          revealControls();
          return true;
        });
      }, DOUBLE_TAP_MS);
    },
    [revealControls, seekBy, showFeedback, triggerRipple],
  );

  const closeSettings = useCallback(() => {
    settingsClosedAtRef.current = Date.now();
    setSettingsOpen(false);
  }, []);

  const handleSurfaceClick = useCallback(() => {
    if (lastPointerTypeRef.current === 'touch') return;
    // Le clic qui vient de fermer le menu ne doit pas lancer la lecture.
    if (settingsOpen || Date.now() - settingsClosedAtRef.current < 300) {
      closeSettings();
      return;
    }
    const el = videoRef.current;
    const willPlay = !el || el.paused || el.ended;
    togglePlay();
    showFeedback(willPlay ? 'play' : 'pause');
  }, [closeSettings, settingsOpen, showFeedback, togglePlay, videoRef]);

  const handleSurfaceDoubleClick = useCallback(() => {
    if (lastPointerTypeRef.current === 'touch') return;
    toggleFullscreen();
  }, [toggleFullscreen]);

  // ── Rendu ────────────────────────────────────────────────────────────────
  /*
   * Les contrôles « large » (44 px au lieu de 36 px, barre de progression de
   * 24 px au lieu de 16 px) ne servaient qu'en plein écran. Or au doigt une
   * cible de 36 px est trop petite : on les active aussi dès que le pointeur
   * principal est grossier (tactile), quelle que soit la taille de l'écran.
   */
  const coarsePointer = useMediaQuery('(pointer: coarse)');
  const largeControls = isFullscreen || coarsePointer;
  /*
   * Sous 640 px, une rangée complète de cibles à 44 px dépasse la largeur du
   * lecteur et se fait rogner : on masque alors volume et mini-lecteur.
   * Le critère est la largeur (et non le tactile) pour rester correct en
   * plein écran paysage sur téléphone, où la place ne manque pas.
   */
  const compactControls = useMediaQuery('(max-width: 640px)');
  const showBigPlay = !started && !buffering && !sourceError;
  const chapters = video.chapters;

  return (
    <div
      ref={containerRef}
      tabIndex={0}
      role="region"
      aria-label={`Lecteur vidéo : ${video.title}`}
      data-theater={theaterMode ? 'true' : undefined}
      onPointerMove={revealControls}
      onFocusCapture={revealControls}
      onMouseLeave={() => {
        if (playingRef.current && !settingsOpenRef.current) setControlsVisible(false);
      }}
      className={clsx(
        'group/player relative w-full select-none overflow-hidden bg-black text-white outline-none kt-focus-ring',
        // `dvh` : en plein écran mobile, `100vh` déborde de la hauteur utile.
        isFullscreen ? 'h-[100dvh]' : 'aspect-video',
        !isFullscreen && !theaterMode && 'rounded-kt',
        playing && !controlsVisible ? 'cursor-none' : 'cursor-default',
        className,
      )}
    >
      <video
        ref={videoRef}
        className="absolute inset-0 h-full w-full bg-black object-contain"
        poster={video.thumbnailUrl ?? undefined}
        playsInline
        preload="metadata"
        crossOrigin={hasCaptions ? 'anonymous' : undefined}
        aria-label={video.title}
      >
        <CaptionsRenderer captions={video.captions} activeLang={captionLang} videoRef={videoRef} />
      </video>

      {/* Surface de clic / tap (sous les contrôles) */}
      <div
        className="absolute inset-0 z-10"
        onPointerDown={handleSurfacePointerDown}
        onClick={handleSurfaceClick}
        onDoubleClick={handleSurfaceDoubleClick}
        aria-hidden="true"
      />

      {/* Retour visuel du double-tap */}
      {tapRipple ? (
        <div
          key={tapRipple.id}
          aria-hidden="true"
          className={clsx(
            'pointer-events-none absolute inset-y-0 z-10 flex w-1/2 items-center justify-center',
            'animate-fade-in bg-white/10 motion-reduce:animate-none',
            tapRipple.side === 'left' ? 'left-0 rounded-r-full' : 'right-0 rounded-l-full',
          )}
        >
          <div className="flex flex-col items-center gap-1 text-white">
            {tapRipple.side === 'left' ? (
              <Rewind className="h-7 w-7" aria-hidden="true" />
            ) : (
              <FastForward className="h-7 w-7" aria-hidden="true" />
            )}
            <span className="text-kt-sm font-medium">{DOUBLE_TAP_SEEK} s</span>
          </div>
        </div>
      ) : null}

      {/* Retour visuel des raccourcis */}
      {feedback ? (
        <div
          key={feedback.id}
          aria-hidden="true"
          className="pointer-events-none absolute inset-0 z-20 flex items-center justify-center"
        >
          <div className="flex animate-fade-in flex-col items-center gap-1 rounded-full bg-black/70 px-6 py-5 motion-reduce:animate-none">
            <FeedbackIcon kind={feedback.kind} />
            {feedback.label ? (
              <span className="text-kt-sm font-medium tabular-nums">{feedback.label}</span>
            ) : null}
          </div>
        </div>
      ) : null}

      {/* Grand bouton de lecture central */}
      {showBigPlay ? (
        <button
          type="button"
          onClick={() => {
            togglePlay();
            revealControls();
          }}
          aria-label="Lire la vidéo"
          className="absolute left-1/2 top-1/2 z-20 flex h-16 w-16 -translate-x-1/2 -translate-y-1/2 items-center justify-center rounded-full bg-brand text-white shadow-lg transition-transform duration-150 ease-kt hover:scale-105 motion-reduce:transition-none kt-focus-ring sm:h-20 sm:w-20"
        >
          <Play className="ml-1 h-8 w-8 fill-current sm:h-10 sm:w-10" aria-hidden="true" />
        </button>
      ) : null}

      {/* Indicateur de chargement */}
      {buffering && !sourceError ? (
        <div
          className="pointer-events-none absolute inset-0 z-20 flex items-center justify-center"
          role="status"
          aria-live="polite"
        >
          <LoaderCircle
            className="h-12 w-12 animate-spin text-white/90 motion-reduce:animate-none"
            aria-hidden="true"
          />
          <span className="sr-only">Chargement de la vidéo…</span>
        </div>
      ) : null}

      {/* Écran d'erreur */}
      {sourceError ? (
        <div className="absolute inset-0 z-30 flex flex-col items-center justify-center gap-3 bg-black/90 px-6 text-center">
          <TriangleAlert className="h-10 w-10 text-brand" aria-hidden="true" />
          <p className="max-w-sm text-kt-base text-white">{sourceError}</p>
          <button
            type="button"
            onClick={retry}
            className="inline-flex items-center gap-2 rounded-pill bg-white px-4 py-2 text-kt-base font-medium text-black transition-opacity hover:opacity-90 kt-focus-ring"
          >
            <RefreshCw className="h-4 w-4" aria-hidden="true" />
            Réessayer
          </button>
        </div>
      ) : null}

      {/* Barre de contrôles */}
      <div
        className={clsx(
          'absolute inset-x-0 bottom-0 z-20 transition-opacity duration-200 ease-kt motion-reduce:transition-none',
          controlsVisible || !started ? 'opacity-100' : 'pointer-events-none opacity-0',
        )}
      >
        <div
          className="pointer-events-none absolute inset-x-0 bottom-0 h-28 bg-gradient-to-t from-black/90 via-black/45 to-transparent"
          aria-hidden="true"
        />
        <div className="relative px-2 pb-1 sm:px-3 sm:pb-2">
          <ProgressBar
            currentTime={currentTime}
            duration={duration}
            buffered={buffered}
            chapters={chapters}
            large={largeControls}
            onSeek={seekTo}
            onScrubStart={() => {
              scrubbingRef.current = true;
              setControlsVisible(true);
            }}
            onScrubEnd={() => {
              scrubbingRef.current = false;
              revealControls();
            }}
          />
          <PlayerControls
            playing={playing}
            ended={ended}
            onTogglePlay={togglePlay}
            onNext={onNext}
            volume={volume}
            muted={muted}
            onVolumeChange={changeVolume}
            onToggleMute={toggleMute}
            currentTime={currentTime}
            duration={duration}
            captionsAvailable={hasCaptions}
            captionsOn={captionLang !== null}
            onToggleCaptions={toggleCaptions}
            settingsOpen={settingsOpen}
            onToggleSettings={() => {
              if (settingsOpen) closeSettings();
              else setSettingsOpen(true);
            }}
            settingsButtonRef={settingsButtonRef}
            settingsMenu={
              <SettingsMenu
                open={settingsOpen}
                onClose={closeSettings}
                anchorRef={settingsButtonRef}
                levels={levels}
                currentLevel={currentLevel}
                activeHeight={activeHeight}
                onLevelChange={changeLevel}
                playbackRate={playbackRate}
                onRateChange={changeRate}
                captions={video.captions}
                activeCaptionLang={captionLang}
                onCaptionChange={changeCaptions}
              />
            }
            pipSupported={pipSupported}
            pipActive={pipActive}
            onTogglePip={togglePip}
            theaterAvailable={Boolean(onTheaterToggle)}
            theaterMode={theaterMode}
            onToggleTheater={handleTheaterToggle}
            isFullscreen={isFullscreen}
            onToggleFullscreen={toggleFullscreen}
            large={largeControls}
            compact={compactControls}
          />
        </div>
      </div>
    </div>
  );
}

export default VideoPlayer;
