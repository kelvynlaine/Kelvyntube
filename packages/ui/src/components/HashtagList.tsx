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

  // `inline-flex` + `kt-tap-y` : les hashtags sont des cibles de 20 px de haut
  // dans un paragraphe. On ne peut pas leur donner 44 px de large (ils se
  // chevaucheraient dans un flux qui s'enroule), mais 44 px de hauteur au
  // doigt suffit à les rendre atteignables sans changer le rendu souris.
  const itemClass =
    'inline-flex items-center rounded text-kt-base font-medium text-accent-fg kt-tap-y hover:underline kt-focus-ring';

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
