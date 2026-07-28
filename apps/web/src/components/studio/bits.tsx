'use client';

import { ThumbsDown, ThumbsUp } from 'lucide-react';
import { Tooltip, cn } from '@kelvyntube/ui';
import { formatNumber, formatPercent } from './studio-format';

/**
 * Petites briques partagées par les écrans du Studio.
 */

/** Miniature de tableau (ratio 16/9, taille imposée par le conteneur). */
export function StudioThumbnail({
  url,
  className,
  alt = '',
}: {
  url: string | null;
  className?: string;
  alt?: string;
}) {
  return (
    <span
      className={cn(
        'relative block shrink-0 overflow-hidden rounded bg-bg-hover',
        className,
      )}
    >
      {url ? (
        // Miniatures servies par le stockage objet : `next/image` n'apporte rien
        // ici (URL déjà dimensionnée, pas de layout shift grâce au conteneur).
        // eslint-disable-next-line @next/next/no-img-element
        <img src={url} alt={alt} loading="lazy" className="size-full object-cover" />
      ) : null}
    </span>
  );
}

/** Barre de ratio « J'aime vs J'aime pas » (lecture seule). */
export function LikeRatio({
  likeCount,
  dislikeCount,
}: {
  likeCount: number;
  dislikeCount: number;
}) {
  const total = likeCount + dislikeCount;
  const ratio = total > 0 ? (likeCount / total) * 100 : 0;

  return (
    <Tooltip
      content={
        total > 0
          ? `${formatNumber(likeCount)} j'aime · ${formatNumber(dislikeCount)} j'aime pas (${formatPercent(ratio)} positifs)`
          : 'Aucune réaction pour le moment'
      }
      side="top"
    >
      <span className="flex w-24 flex-col gap-1">
        <span className="flex items-center justify-between gap-2 text-kt-sm tabular-nums text-fg">
          <span className="inline-flex items-center gap-1">
            <ThumbsUp size={12} aria-hidden="true" />
            {formatNumber(likeCount)}
          </span>
          <span className="inline-flex items-center gap-1 text-fg-subtle">
            <ThumbsDown size={12} aria-hidden="true" />
            {formatNumber(dislikeCount)}
          </span>
        </span>
        <span
          aria-hidden="true"
          className="h-1 w-full overflow-hidden rounded-pill bg-bg-active"
        >
          <span
            className="block h-full rounded-pill bg-fg"
            style={{ width: `${total > 0 ? ratio : 0}%` }}
          />
        </span>
        <span className="sr-only">
          {total > 0
            ? `${formatPercent(ratio)} d'avis positifs`
            : 'Aucune réaction pour le moment'}
        </span>
      </span>
    </Tooltip>
  );
}
