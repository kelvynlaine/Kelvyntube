'use client';

import { useMemo, useState, type RefObject } from 'react';
import { ListVideo } from 'lucide-react';
import { formatDuration, type ChapterDTO } from '@kelvyntube/shared';
import { usePlaybackPosition } from './usePlayerBridge';

export interface ChapterListProps {
  chapters: ChapterDTO[];
  /** Miniature de repli (les chapitres n'ont pas d'image propre). */
  thumbnailUrl: string | null;
  durationSec: number;
  onSeek: (seconds: number) => void;
  /** Conteneur du lecteur : sert à surligner le chapitre en cours. */
  playerRef: RefObject<HTMLDivElement | null>;
  className?: string;
}

const COLLAPSED_COUNT = 5;

/** Liste des chapitres : vignette, titre, horodatage, saut au clic. */
export function ChapterList({
  chapters,
  thumbnailUrl,
  durationSec,
  onSeek,
  playerRef,
  className,
}: ChapterListProps) {
  const [expanded, setExpanded] = useState(false);
  const position = usePlaybackPosition(playerRef);

  const sorted = useMemo(
    () => [...chapters].sort((a, b) => a.startSec - b.startSec),
    [chapters],
  );

  const activeIndex = useMemo(() => {
    let index = -1;
    for (let i = 0; i < sorted.length; i += 1) {
      if (sorted[i].startSec <= position) index = i;
      else break;
    }
    return index;
  }, [position, sorted]);

  if (sorted.length === 0) return null;

  const visible = expanded ? sorted : sorted.slice(0, COLLAPSED_COUNT);

  return (
    <section
      aria-labelledby="titre-chapitres"
      className={`rounded-kt bg-bg-elevated p-3 ${className ?? ''}`}
    >
      <h3
        id="titre-chapitres"
        className="flex items-center gap-2 text-kt-md font-medium text-fg"
      >
        <ListVideo size={18} aria-hidden="true" />
        Chapitres
        <span className="text-kt-sm font-normal text-fg-muted">
          ({sorted.length})
        </span>
      </h3>

      <ul className="mt-2 flex flex-col">
        {visible.map((chapter, index) => {
          const next = sorted[index + 1];
          const endSec = next ? next.startSec : durationSec;
          const active = index === activeIndex;

          return (
            <li key={`${chapter.startSec}-${chapter.title}`}>
              <button
                type="button"
                aria-current={active ? 'true' : undefined}
                onClick={() => onSeek(chapter.startSec)}
                className={`flex w-full items-center gap-3 rounded-kt p-2 text-left transition-colors hover:bg-bg-hover kt-focus-ring ${
                  active ? 'bg-bg-hover' : ''
                }`}
              >
                <span className="relative block h-[54px] w-24 shrink-0 overflow-hidden rounded bg-bg">
                  {thumbnailUrl ? (
                    <img
                      src={thumbnailUrl}
                      alt=""
                      loading="lazy"
                      decoding="async"
                      className="size-full object-cover"
                    />
                  ) : null}
                  <span className="absolute bottom-1 right-1 rounded bg-black/80 px-1 text-kt-xs font-medium tabular-nums text-white">
                    {formatDuration(chapter.startSec)}
                  </span>
                </span>

                <span className="flex min-w-0 flex-col">
                  <span
                    className={`kt-clamp-2 text-kt-base ${
                      active ? 'font-medium text-fg' : 'text-fg'
                    }`}
                  >
                    {chapter.title}
                  </span>
                  <span className="text-kt-sm tabular-nums text-fg-muted">
                    {formatDuration(chapter.startSec)}
                    {endSec > chapter.startSec
                      ? ` – ${formatDuration(endSec)}`
                      : ''}
                  </span>
                </span>
              </button>
            </li>
          );
        })}
      </ul>

      {sorted.length > COLLAPSED_COUNT ? (
        <button
          type="button"
          aria-expanded={expanded}
          onClick={() => setExpanded((current) => !current)}
          className="mt-1 rounded px-2 py-1 text-kt-base font-medium text-fg-muted hover:text-fg kt-focus-ring"
        >
          {expanded
            ? 'Afficher moins de chapitres'
            : `Afficher les ${sorted.length} chapitres`}
        </button>
      ) : null}
    </section>
  );
}
