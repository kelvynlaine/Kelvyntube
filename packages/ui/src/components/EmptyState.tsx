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
        'flex flex-col items-center justify-center text-center',
        size === 'sm' ? 'gap-2 px-4 py-8' : 'gap-3 px-6 py-16',
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

      <h3 className={cn('font-medium text-fg', size === 'sm' ? 'text-kt-md' : 'text-kt-lg')}>
        {title}
      </h3>

      {description ? (
        <p className="max-w-md text-kt-base text-fg-muted">{description}</p>
      ) : null}

      {action ? <div className="mt-2 flex items-center gap-2">{action}</div> : null}
    </div>
  );
}
