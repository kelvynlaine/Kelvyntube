'use client';

import type { CSSProperties, ReactNode } from 'react';
import { cn } from '@kelvyntube/ui';

/**
 * ═══════════════════════════════════════════════════════════════════════════
 *  CADRE RESPONSIVE DES GRAPHIQUES
 *
 *  Deux problèmes de mobile résolus au même endroit :
 *
 *  1. LA HAUTEUR. Une courbe de 300 px occupe un tiers de l'écran d'un
 *     iPhone. On veut donc une hauteur mobile réduite — mais les hauteurs
 *     viennent des props (260, 280, 300, 320…), et Tailwind ne peut pas
 *     générer `h-[300px]` à partir d'une valeur dynamique. On passe donc les
 *     deux hauteurs en variables CSS et on bascule de l'une à l'autre avec une
 *     classe STATIQUE (`h-[var(--kt-chart-h-sm)] feed-3:h-[var(--kt-chart-h)]`),
 *     que le JIT voit bien. Zéro media query en JavaScript, donc aucun risque
 *     de désynchronisation à l'hydratation.
 *
 *  2. LE DÉBORDEMENT. `ResponsiveContainer` mesure son parent : si ce parent
 *     est un élément de grille/flex sans `min-width: 0`, le SVG peut le forcer
 *     à s'élargir et faire déborder toute la page horizontalement. `min-w-0`
 *     + `overflow-hidden` verrouillent la largeur sur celle du conteneur.
 * ═══════════════════════════════════════════════════════════════════════════
 */
export function ChartFrame({
  height,
  mobileHeight,
  label,
  className,
  children,
}: {
  height: number;
  mobileHeight: number;
  /** Description du graphique pour les lecteurs d'écran (`role="img"`). */
  label: string;
  className?: string;
  children: ReactNode;
}) {
  return (
    <div
      role="img"
      aria-label={label}
      style={
        {
          '--kt-chart-h': `${height}px`,
          '--kt-chart-h-sm': `${mobileHeight}px`,
        } as CSSProperties
      }
      className={cn(
        'h-[var(--kt-chart-h-sm)] w-full min-w-0 overflow-hidden feed-3:h-[var(--kt-chart-h)]',
        className,
      )}
    >
      {children}
    </div>
  );
}
