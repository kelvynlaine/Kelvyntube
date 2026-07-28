'use client';

import clsx from 'clsx';
import type { ChapterDTO } from '@kelvyntube/shared';

/** Intervalle de temps mis en forme sur la barre de progression. */
export interface ChapterSegment {
  index: number;
  start: number;
  end: number;
  title: string;
}

/** Paire [début, fin] d'une plage tamponnée. */
export type BufferedRange = [number, number];

/**
 * Découpe la durée en segments à partir des chapitres.
 * Sans chapitre (ou durée inconnue), retourne un unique segment plein.
 */
export function buildChapterSegments(
  chapters: ChapterDTO[],
  duration: number,
): ChapterSegment[] {
  if (!Number.isFinite(duration) || duration <= 0) {
    return [{ index: 0, start: 0, end: 1, title: '' }];
  }
  const sorted = [...chapters]
    .filter((c) => Number.isFinite(c.startSec) && c.startSec >= 0 && c.startSec < duration)
    .sort((a, b) => a.startSec - b.startSec);

  if (sorted.length === 0) {
    return [{ index: 0, start: 0, end: duration, title: '' }];
  }

  // Un chapitre implicite couvre le début si le premier ne commence pas à 0.
  const starts = sorted[0].startSec > 0 ? [{ startSec: 0, title: '' }, ...sorted] : sorted;

  return starts.map((chapter, i) => ({
    index: i,
    start: chapter.startSec,
    end: i + 1 < starts.length ? starts[i + 1].startSec : duration,
    title: chapter.title,
  }));
}

/** Chapitre contenant l'instant donné. */
export function findChapterAt(
  segments: ChapterSegment[],
  time: number,
): ChapterSegment | null {
  for (const segment of segments) {
    if (time >= segment.start && time < segment.end) return segment;
  }
  return segments.length > 0 ? segments[segments.length - 1] : null;
}

function ratioWithin(value: number, start: number, end: number): number {
  const length = end - start;
  if (length <= 0) return 0;
  return Math.min(1, Math.max(0, (value - start) / length));
}

interface ChapterMarkersProps {
  segments: ChapterSegment[];
  duration: number;
  /** Position affichée (temps courant ou position de scrubbing). */
  currentTime: number;
  buffered: BufferedRange[];
  /** Index du segment survolé (mis en avant). */
  hoveredIndex: number | null;
  /** Barre agrandie (survol / scrubbing). */
  expanded: boolean;
}

/**
 * Rendu purement visuel de la piste : fond, tampon et progression,
 * segmentés par chapitre comme sur YouTube.
 */
export function ChapterMarkers({
  segments,
  duration,
  currentTime,
  buffered,
  hoveredIndex,
  expanded,
}: ChapterMarkersProps) {
  const safeDuration = Number.isFinite(duration) && duration > 0 ? duration : 1;

  return (
    <div className="pointer-events-none absolute inset-x-0 top-1/2 flex -translate-y-1/2 items-center gap-[2px]">
      {segments.map((segment) => {
        const widthPct = ((segment.end - segment.start) / safeDuration) * 100;
        const progress = ratioWithin(currentTime, segment.start, segment.end);
        const isHovered = hoveredIndex === segment.index;

        return (
          <div
            key={segment.index}
            style={{ width: `${widthPct}%` }}
            className={clsx(
              'relative overflow-hidden rounded-[1px] bg-white/30 transition-[height] duration-100 ease-kt',
              expanded ? 'h-[5px]' : 'h-[3px]',
              isHovered && 'bg-white/40',
            )}
          >
            {/* Plages déjà téléchargées */}
            {buffered.map(([start, end], i) => {
              const from = ratioWithin(start, segment.start, segment.end);
              const to = ratioWithin(end, segment.start, segment.end);
              if (to <= from) return null;
              return (
                <span
                  key={`${segment.index}-${i}`}
                  className="absolute inset-y-0 bg-white/50"
                  style={{ left: `${from * 100}%`, width: `${(to - from) * 100}%` }}
                />
              );
            })}
            {/* Progression de lecture */}
            <span
              className="absolute inset-y-0 left-0 bg-brand"
              style={{ width: `${progress * 100}%` }}
            />
          </div>
        );
      })}
    </div>
  );
}

export default ChapterMarkers;
