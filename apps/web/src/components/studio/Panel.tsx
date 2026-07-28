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
        <header className="flex flex-wrap items-start justify-between gap-3 border-b border-border px-3 py-3 feed-2:px-4">
          <div className="min-w-0">
            <Heading className="text-kt-md font-medium text-fg">{title}</Heading>
            {description ? (
              <p className="mt-0.5 text-kt-sm text-fg-muted">{description}</p>
            ) : null}
          </div>
          {/*
            Les actions ne sont PLUS `shrink-0` : sur un écran de 390 px une
            rangée de chips (« Vues / Temps de visionnage / Abonnés… ») refusait
            de rétrécir et débordait de la page entière. `min-w-0` + `w-full`
            en dessous de feed-2 les laisse passer à la ligne dans leur propre
            conteneur au lieu de pousser la carte.
          */}
          {actions ? (
            <div className="flex w-full min-w-0 flex-wrap items-center gap-2 feed-2:w-auto feed-2:justify-end">
              {actions}
            </div>
          ) : null}
        </header>
      ) : null}

      {/*
        Padding réduit en mobile : chaque pixel de largeur compte à 320 px.
        `bodyClassName` REMPLACE le padding par défaut (au lieu de s'y ajouter) :
        un `p-0` ne pourrait pas neutraliser un `feed-2:p-4` par simple fusion
        de classes, les appelants pilotent donc leur padding de bout en bout.
      */}
      <div className={bodyClassName ? cn(bodyClassName) : 'p-3 feed-2:p-4'}>{children}</div>
    </section>
  );
}
