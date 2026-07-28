'use client';

import type { ReactNode } from 'react';
import { cn } from '@kelvyntube/ui';

export interface PanelProps {
  title?: ReactNode;
  description?: ReactNode;
  /** Actions alignées à droite du titre (sélecteurs, liens…). */
  actions?: ReactNode;
  children: ReactNode;
  className?: string;
  bodyClassName?: string;
  /** Niveau du titre pour respecter la hiérarchie de la page. */
  headingLevel?: 2 | 3;
}

/** Carte de section du Studio : en-tête titré + corps. */
export function Panel({
  title,
  description,
  actions,
  children,
  className,
  bodyClassName,
  headingLevel = 2,
}: PanelProps) {
  const Heading = headingLevel === 2 ? 'h2' : 'h3';

  return (
    <section
      className={cn(
        'flex flex-col rounded-kt border border-border bg-bg-elevated',
        className,
      )}
    >
      {title || actions ? (
        <header className="flex flex-wrap items-start justify-between gap-3 border-b border-border px-4 py-3">
          <div className="min-w-0">
            <Heading className="text-kt-md font-medium text-fg">{title}</Heading>
            {description ? (
              <p className="mt-0.5 text-kt-sm text-fg-muted">{description}</p>
            ) : null}
          </div>
          {actions ? <div className="flex shrink-0 items-center gap-2">{actions}</div> : null}
        </header>
      ) : null}

      <div className={cn('p-4', bodyClassName)}>{children}</div>
    </section>
  );
}
