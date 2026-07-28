import type { ReactNode } from 'react';
import { cn } from '../cn';

export interface EmptyStateProps {
  /** Icône (lucide-react ou SVG). */
  icon?: ReactNode;
  title: ReactNode;
  description?: ReactNode;
  /** Bouton ou groupe de boutons. */
  action?: ReactNode;
  size?: 'sm' | 'md';
  className?: string;
}

/** État vide : aucune vidéo, aucun résultat, playlist vide… */
export function EmptyState({
  icon,
  title,
  description,
  action,
  size = 'md',
  className,
}: EmptyStateProps) {
  return (
    <div
      className={cn(
        // `min-w-0` : rendu dans une grille, l'état vide ne doit pas imposer
        // sa largeur intrinsèque. Marges latérales réduites sous 480 px :
        // 2 × 24 px, c'est 15 % d'un écran de 320 px.
        'flex min-w-0 flex-col items-center justify-center text-center',
        size === 'sm' ? 'gap-2 px-4 py-8' : 'gap-3 px-4 py-12 xs:px-6 xs:py-16',
        className,
      )}
    >
      {icon ? (
        <span
          aria-hidden="true"
          className={cn(
            'flex items-center justify-center rounded-full bg-bg-elevated text-fg-muted',
            size === 'sm' ? 'size-12' : 'size-16',
          )}
        >
          {icon}
        </span>
      ) : null}

      <h3
        className={cn(
          'text-balance font-medium text-fg',
          size === 'sm' ? 'text-kt-md' : 'text-kt-lg',
        )}
      >
        {title}
      </h3>

      {description ? (
        // `max-w-full` avant `max-w-md` : sur un écran de 320 px la ligne de
        // 448 px déborderait sinon du conteneur.
        <p className="max-w-full text-pretty text-kt-base text-fg-muted xs:max-w-md">
          {description}
        </p>
      ) : null}

      {/* `flex-wrap` : deux boutons de 44 px ne tiennent pas côte à côte à
          320 px une fois leurs libellés comptés. */}
      {action ? (
        <div className="mt-2 flex flex-wrap items-center justify-center gap-2">
          {action}
        </div>
      ) : null}
    </div>
  );
}
