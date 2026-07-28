'use client';

import { cn } from '../cn';
import { resolveLinkComponent, type LinkComponent } from '../types';

export interface HashtagListProps {
  /** Tags sans le « # ». */
  tags: string[];
  /** Clic sur un tag (prioritaire sur le rendu en lien). */
  onSelect?: (tag: string) => void;
  /** Construit l'URL d'un tag (par défaut `/hashtag/<tag>`). */
  hrefFor?: (tag: string) => string;
  linkComponent?: LinkComponent;
  /** Nombre maximum de tags affichés. */
  max?: number;
  className?: string;
}

/** Liste de hashtags cliquables affichée au-dessus d'un titre de vidéo. */
export function HashtagList({
  tags,
  onSelect,
  hrefFor,
  linkComponent,
  max,
  className,
}: HashtagListProps) {
  const Link = resolveLinkComponent(linkComponent);
  const visible = typeof max === 'number' ? tags.slice(0, max) : tags;

  if (visible.length === 0) return null;

  const itemClass =
    'rounded text-kt-base font-medium text-accent-fg hover:underline kt-focus-ring';

  return (
    <p className={cn('flex flex-wrap items-center gap-x-2 gap-y-1', className)}>
      {visible.map((tag) => {
        const normalized = tag.replace(/^#/, '');
        if (onSelect) {
          return (
            <button
              key={normalized}
              type="button"
              onClick={() => onSelect(normalized)}
              className={itemClass}
            >
              #{normalized}
            </button>
          );
        }
        return (
          <Link
            key={normalized}
            href={hrefFor ? hrefFor(normalized) : `/hashtag/${normalized}`}
            className={itemClass}
          >
            #{normalized}
          </Link>
        );
      })}
    </p>
  );
}
