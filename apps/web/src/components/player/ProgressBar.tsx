'use client';

import clsx from 'clsx';
import { useCallback, useMemo, useRef, useState } from 'react';
import { formatDuration, type ChapterDTO } from '@kelvyntube/shared';
import {
  ChapterMarkers,
  buildChapterSegments,
  findChapterAt,
  type BufferedRange,
} from './ChapterMarkers';

export interface ProgressBarProps {
  currentTime: number;
  duration: number;
  buffered: BufferedRange[];
  chapters: ChapterDTO[];
  /** Déplacement de la tête de lecture. */
  onSeek: (time: number) => void;
  onScrubStart?: () => void;
  onScrubEnd?: (time: number) => void;
  /** Instant survolé (`null` quand la souris quitte la barre). */
  onHoverChange?: (time: number | null) => void;
  /** Zones tactiles agrandies (plein écran mobile). */
  large?: boolean;
  className?: string;
}

/**
 * Barre de progression façon YouTube : zone de survol large, tampon,
 * progression rouge, poignée au survol, scrubbing souris + tactile,
 * infobulle de temps et segmentation par chapitres.
 */
export function ProgressBar({
  currentTime,
  duration,
  buffered,
  chapters,
  onSeek,
  onScrubStart,
  onScrubEnd,
  onHoverChange,
  large = false,
  className,
}: ProgressBarProps) {
  const trackRef = useRef<HTMLDivElement | null>(null);
  const [hoverRatio, setHoverRatio] = useState<number | null>(null);
  const [scrubRatio, setScrubRatio] = useState<number | null>(null);
  const [focused, setFocused] = useState(false);

  const safeDuration = Number.isFinite(duration) && duration > 0 ? duration : 0;
  const segments = useMemo(
    () => buildChapterSegments(chapters, safeDuration),
    [chapters, safeDuration],
  );

  const displayedTime = scrubRatio !== null ? scrubRatio * safeDuration : currentTime;
  const progressRatio = safeDuration > 0 ? Math.min(1, Math.max(0, displayedTime / safeDuration)) : 0;
  const hoverTime = hoverRatio !== null ? hoverRatio * safeDuration : null;
  const hoveredChapter = hoverTime !== null ? findChapterAt(segments, hoverTime) : null;
  const hoveredIndex = hoveredChapter && chapters.length > 0 ? hoveredChapter.index : null;
  const expanded = hoverRatio !== null || scrubRatio !== null || focused;

  /** Convertit une position horizontale en ratio 0 → 1. */
  const ratioFromClientX = useCallback((clientX: number): number => {
    const track = trackRef.current;
    if (!track) return 0;
    const rect = track.getBoundingClientRect();
    if (rect.width <= 0) return 0;
    return Math.min(1, Math.max(0, (clientX - rect.left) / rect.width));
  }, []);

  const handlePointerDown = useCallback(
    (event: React.PointerEvent<HTMLDivElement>) => {
      if (safeDuration <= 0) return;
      if (event.button !== 0 && event.pointerType === 'mouse') return;
      event.preventDefault();
      trackRef.current?.focus();
      event.currentTarget.setPointerCapture(event.pointerId);
      const ratio = ratioFromClientX(event.clientX);
      setScrubRatio(ratio);
      onScrubStart?.();
      onSeek(ratio * safeDuration);
    },
    [onScrubStart, onSeek, ratioFromClientX, safeDuration],
  );

  const handlePointerMove = useCallback(
    (event: React.PointerEvent<HTMLDivElement>) => {
      if (safeDuration <= 0) return;
      const ratio = ratioFromClientX(event.clientX);
      setHoverRatio(ratio);
      onHoverChange?.(ratio * safeDuration);
      if (scrubRatio !== null) {
        setScrubRatio(ratio);
        onSeek(ratio * safeDuration);
      }
    },
    [onHoverChange, onSeek, ratioFromClientX, safeDuration, scrubRatio],
  );

  const endScrub = useCallback(
    (event: React.PointerEvent<HTMLDivElement>) => {
      if (scrubRatio === null) return;
      if (event.currentTarget.hasPointerCapture(event.pointerId)) {
        event.currentTarget.releasePointerCapture(event.pointerId);
      }
      const time = scrubRatio * safeDuration;
      setScrubRatio(null);
      if (event.pointerType !== 'mouse') {
        setHoverRatio(null);
        onHoverChange?.(null);
      }
      onScrubEnd?.(time);
    },
    [onHoverChange, onScrubEnd, safeDuration, scrubRatio],
  );

  const handlePointerLeave = useCallback(() => {
    if (scrubRatio !== null) return;
    setHoverRatio(null);
    onHoverChange?.(null);
  }, [onHoverChange, scrubRatio]);

  const handleKeyDown = useCallback(
    (event: React.KeyboardEvent<HTMLDivElement>) => {
      if (safeDuration <= 0) return;
      let next: number | null = null;
      switch (event.key) {
        case 'ArrowLeft':
          next = currentTime - 5;
          break;
        case 'ArrowRight':
          next = currentTime + 5;
          break;
        case 'ArrowDown':
        case 'PageDown':
          next = currentTime - 10;
          break;
        case 'ArrowUp':
        case 'PageUp':
          next = currentTime + 10;
          break;
        case 'Home':
          next = 0;
          break;
        case 'End':
          next = safeDuration;
          break;
        default:
          return;
      }
      event.preventDefault();
      event.stopPropagation();
      onSeek(Math.min(safeDuration, Math.max(0, next)));
    },
    [currentTime, onSeek, safeDuration],
  );

  return (
    <div
      className={clsx(
        'group/progress relative w-full cursor-pointer touch-none select-none',
        large ? 'h-6' : 'h-4',
        className,
      )}
      onPointerDown={handlePointerDown}
      onPointerMove={handlePointerMove}
      onPointerUp={endScrub}
      onPointerCancel={endScrub}
      onPointerLeave={handlePointerLeave}
    >
      {/* Piste focalisable (rôle curseur) */}
      <div
        ref={trackRef}
        role="slider"
        tabIndex={0}
        aria-label="Barre de progression"
        aria-valuemin={0}
        aria-valuemax={Math.round(safeDuration)}
        aria-valuenow={Math.round(displayedTime)}
        aria-valuetext={`${formatDuration(displayedTime)} sur ${formatDuration(safeDuration)}`}
        aria-orientation="horizontal"
        onKeyDown={handleKeyDown}
        onFocus={() => setFocused(true)}
        onBlur={() => setFocused(false)}
        className="absolute inset-0 rounded-sm outline-none kt-focus-ring"
      >
        <ChapterMarkers
          segments={segments}
          duration={safeDuration}
          currentTime={displayedTime}
          buffered={buffered}
          hoveredIndex={hoveredIndex}
          expanded={expanded}
        />

        {/* Poignée : visible au survol, pendant le scrubbing et au focus */}
        <span
          aria-hidden="true"
          className={clsx(
            'pointer-events-none absolute top-1/2 -ml-[6px] h-3 w-3 -translate-y-1/2 rounded-full bg-brand',
            'transition-transform duration-100 ease-kt motion-reduce:transition-none',
            expanded ? 'scale-100' : 'scale-0',
          )}
          style={{ left: `${progressRatio * 100}%` }}
        />
      </div>

      {/* Infobulle de temps (+ titre du chapitre survolé) */}
      {hoverRatio !== null && safeDuration > 0 ? (
        <div
          aria-hidden="true"
          className="pointer-events-none absolute bottom-full mb-2 -translate-x-1/2 whitespace-nowrap"
          style={{ left: `${Math.min(96, Math.max(4, hoverRatio * 100))}%` }}
        >
          {hoveredChapter?.title ? (
            <div className="mb-1 max-w-[220px] truncate rounded-kt bg-black/85 px-2 py-1 text-center text-kt-sm font-medium text-white">
              {hoveredChapter.title}
            </div>
          ) : null}
          <div className="rounded-[4px] bg-black/85 px-2 py-[2px] text-center text-kt-sm font-medium tabular-nums text-white">
            {formatDuration(hoverTime ?? 0)}
          </div>
        </div>
      ) : null}
    </div>
  );
}

export default ProgressBar;
