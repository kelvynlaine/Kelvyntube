'use client';

import { useMemo } from 'react';
import { cn } from '@kelvyntube/ui';
import { formatNumber, formatPercent } from '../studio-format';

export interface BreakdownRow {
  label: string;
  /** Volume associé (vues, spectateurs…). Optionnel pour les tranches d'âge. */
  value?: number;
  /** Pourcentage déjà calculé par l'API (0-100). */
  pct: number;
}

export interface BreakdownBarsProps {
  rows: BreakdownRow[];
  /** Nombre de lignes détaillées avant regroupement dans « Autres ». */
  limit?: number;
  /** Libellé de la colonne de volume (masqué si les valeurs sont absentes). */
  valueLabel?: string;
  color?: string;
  emptyLabel?: string;
  className?: string;
}

/**
 * Barres horizontales de répartition (sources de trafic, appareils, pays,
 * tranches d'âge). Rendu en HTML/CSS pur : léger, lisible dans les deux
 * thèmes, et surtout lisible par un lecteur d'écran — les barres sont
 * décoratives, les valeurs sont du texte.
 */
export function BreakdownBars({
  rows,
  limit = 10,
  valueLabel = 'Vues',
  color,
  emptyLabel = 'Aucune donnée sur cette période.',
  className,
}: BreakdownBarsProps) {
  const displayed = useMemo(() => {
    const sorted = [...rows].sort((a, b) => b.pct - a.pct);
    if (sorted.length <= limit) return sorted;

    const head = sorted.slice(0, limit);
    const tail = sorted.slice(limit);
    const others: BreakdownRow = {
      label: 'Autres',
      pct: tail.reduce((sum, row) => sum + row.pct, 0),
      value: tail.some((row) => typeof row.value === 'number')
        ? tail.reduce((sum, row) => sum + (row.value ?? 0), 0)
        : undefined,
    };
    return [...head, others];
  }, [rows, limit]);

  if (displayed.length === 0) {
    return <p className={cn('text-kt-sm text-fg-muted', className)}>{emptyLabel}</p>;
  }

  // Normalisation sur le maximum : une répartition très plate reste lisible.
  const max = Math.max(...displayed.map((row) => row.pct), 1);

  return (
    <ul className={cn('flex flex-col gap-3', className)}>
      {displayed.map((row) => (
        <li key={row.label} className="flex flex-col gap-1">
          <div className="flex items-baseline justify-between gap-3 text-kt-sm">
            <span className="min-w-0 truncate text-fg">{row.label}</span>
            <span className="shrink-0 tabular-nums text-fg-muted">
              {typeof row.value === 'number' ? (
                <>
                  <span className="text-fg">{formatPercent(row.pct)}</span>
                  <span className="ml-2 text-fg-subtle">
                    {formatNumber(row.value)} {valueLabel.toLowerCase()}
                  </span>
                </>
              ) : (
                <span className="text-fg">{formatPercent(row.pct)}</span>
              )}
            </span>
          </div>
          <div
            aria-hidden="true"
            className="h-2 w-full overflow-hidden rounded-pill bg-bg-hover"
          >
            <div
              className="h-full rounded-pill transition-[width] duration-300 ease-kt"
              style={{
                width: `${Math.max(2, (row.pct / max) * 100)}%`,
                backgroundColor: color ?? 'rgb(var(--kt-accent-fg))',
              }}
            />
          </div>
        </li>
      ))}
    </ul>
  );
}
