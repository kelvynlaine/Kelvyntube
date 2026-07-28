'use client';

import { useEffect, useRef, useState } from 'react';
import { useRouter } from 'next/navigation';
import { RichText } from '@kelvyntube/ui';
import {
  formatRelativeTime,
  formatViews,
  type VideoDetailDTO,
} from '@kelvyntube/shared';
import { PATHS } from '@/lib/nav';

export interface VideoDescriptionProps {
  video: VideoDetailDTO;
  /** Compteur de vues à jour (temps réel). */
  viewCount: number;
  onSeek: (seconds: number) => void;
  className?: string;
}

/**
 * Bloc de description repliable : statistiques en gras, puis texte enrichi
 * (liens, mentions, hashtags et horodatages cliquables).
 */
export function VideoDescription({
  video,
  viewCount,
  onSeek,
  className,
}: VideoDescriptionProps) {
  const router = useRouter();
  const [expanded, setExpanded] = useState(false);
  const [overflowing, setOverflowing] = useState(false);
  const textRef = useRef<HTMLDivElement | null>(null);

  const description = video.description?.trim() ?? '';
  const publishedLabel = video.publishedAt
    ? formatRelativeTime(video.publishedAt)
    : formatRelativeTime(video.createdAt);

  // Le bouton « …plus » n'apparaît que si le texte dépasse réellement 3 lignes.
  useEffect(() => {
    if (expanded) return;
    // La troncature est portée par le `<span>` rendu par `RichText`.
    const el = textRef.current?.firstElementChild as HTMLElement | null;
    if (!el) return;

    const check = () => setOverflowing(el.scrollHeight > el.clientHeight + 2);
    check();

    if (typeof ResizeObserver === 'undefined') return;
    const observer = new ResizeObserver(check);
    observer.observe(el);
    return () => observer.disconnect();
  }, [description, expanded]);

  return (
    <div
      className={`rounded-kt bg-bg-elevated p-3 text-kt-base text-fg ${className ?? ''}`}
    >
      <p className="font-medium">
        <span>{formatViews(viewCount)}</span>
        <span aria-hidden="true"> · </span>
        <span>{publishedLabel}</span>
      </p>

      {description ? (
        <>
          {/* Le clic n'importe où déplie le bloc (le bouton reste l'accès clavier). */}
          <div
            ref={textRef}
            onClick={() => {
              if (!expanded) setExpanded(true);
            }}
            className={expanded ? 'mt-2' : 'mt-2 cursor-pointer'}
          >
            <RichText
              text={description}
              clamp={expanded ? 0 : 3}
              onTimestampClick={onSeek}
              onMentionClick={(handle) => router.push(PATHS.channel(handle))}
              onHashtagClick={(tag) => router.push(PATHS.hashtag(tag))}
            />
          </div>

          {overflowing || expanded ? (
            <button
              type="button"
              aria-expanded={expanded}
              onClick={() => setExpanded((current) => !current)}
              /*
               * `kt-tap-y` : au doigt (et au doigt seulement), « ...plus »
               * passe de 20 px à 44 px de haut. Le rendu souris est inchangé.
               */
              className="mt-1 inline-flex items-center rounded font-medium text-fg hover:underline kt-focus-ring kt-tap-y"
            >
              {expanded ? 'Afficher moins' : '...plus'}
            </button>
          ) : null}
        </>
      ) : (
        <p className="mt-2 text-fg-muted">Aucune description.</p>
      )}
    </div>
  );
}
