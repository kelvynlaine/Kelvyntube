'use client';

import { TrendingDown, TrendingUp } from 'lucide-react';
import type { ReactNode } from 'react';
import { cn } from '../cn';

export interface StatCardProps {
  label: ReactNode;
  /** Valeur principale, déjà formatée. */
  value: ReactNode;
  /** Variation en pourcentage (positif ou négatif). */
  delta?: number | null;
  /** Précision de la période comparée (« vs 28 jours précédents »). */
  deltaLabel?: ReactNode;
  hint?: ReactNode;
  /** Série de valeurs brutes pour la sparkline (SVG maison). */
  sparkline?: number[];
  icon?: ReactNode;
  /** Inverse la couleur du delta (une baisse devient favorable). */
  invertDelta?: boolean;
  onClick?: () => void;
  className?: string;
}

/** Construit le tracé d'une sparkline normalisée dans un viewBox 100×32. */
function buildSparklinePath(values: number[]): { line: string; area: string } {
  if (values.length < 2) return { line: '', area: '' };

  const min = Math.min(...values);
  const max = Math.max(...values);
  const span = max - min || 1;
  const stepX = 100 / (values.length - 1);

  const points = values.map((value, index) => {
    const x = index * stepX;
    // 2 px de marge haute et basse pour ne pas rogner le trait
    const y = 30 - ((value - min) / span) * 28;
    return `${x.toFixed(2)},${y.toFixed(2)}`;
  });

  const line = `M${points.join(' L')}`;
  const area = `${line} L100,32 L0,32 Z`;
  return { line, area };
}

/** Carte de métrique du Studio : libellé, valeur, variation et sparkline. */
export function StatCard({
  label,
  value,
  delta,
  deltaLabel,
  hint,
  sparkline,
  icon,
  invertDelta = false,
  onClick,
  className,
}: StatCardProps) {
  const hasDelta = typeof delta === 'number' && Number.isFinite(delta);
  const positive = hasDelta ? delta > 0 : false;
  const favorable = invertDelta ? !positive : positive;
  const neutral = hasDelta && delta === 0;

  const { line, area } = sparkline
    ? buildSparklinePath(sparkline)
    : { line: '', area: '' };

  const Wrapper = onClick ? 'button' : 'div';

  return (
    <Wrapper
      {...(onClick ? { type: 'button' as const, onClick } : {})}
      className={cn(
        'flex min-w-0 flex-col gap-2 rounded-kt border border-border bg-bg-elevated p-3 text-left xs:p-4',
        onClick && 'transition-colors hover:bg-bg-hover kt-focus-ring',
        className,
      )}
    >
      {/*
        `min-w-0` + `truncate` : une StatCard fait ~150 px de large dans une
        grille à 2 colonnes sur téléphone. Sans ça, un libellé comme
        « Durée de visionnage moyenne » élargit la carte et fait déborder
        toute la grille horizontalement.
      */}
      <div className="flex items-center justify-between gap-2">
        <span className="min-w-0 truncate text-kt-sm text-fg-muted" title={typeof label === 'string' ? label : undefined}>
          {label}
        </span>
        {icon ? (
          <span aria-hidden="true" className="shrink-0 text-fg-subtle">
            {icon}
          </span>
        ) : null}
      </div>

      <p className="break-words text-kt-lg font-medium tabular-nums text-fg xs:text-kt-xl">
        {value}
      </p>

      {hasDelta ? (
        <p
          className={cn(
            'flex flex-wrap items-center gap-x-1 text-kt-sm tabular-nums',
            neutral ? 'text-fg-muted' : favorable ? 'text-success' : 'text-danger',
          )}
        >
          {!neutral &&
            (positive ? (
              <TrendingUp size={14} aria-hidden="true" />
            ) : (
              <TrendingDown size={14} aria-hidden="true" />
            ))}
          <span>
            {delta > 0 ? '+' : ''}
            {delta.toFixed(1)} %
          </span>
          {deltaLabel ? (
            <span className="text-fg-subtle">{deltaLabel}</span>
          ) : null}
        </p>
      ) : null}

      {line ? (
        <svg
          viewBox="0 0 100 32"
          preserveAspectRatio="none"
          role="presentation"
          aria-hidden="true"
          className={cn(
            'h-8 w-full',
            neutral || !hasDelta
              ? 'text-fg-muted'
              : favorable
                ? 'text-success'
                : 'text-danger',
          )}
        >
          <path d={area} fill="currentColor" opacity="0.12" />
          <path
            d={line}
            fill="none"
            stroke="currentColor"
            strokeWidth="1.5"
            strokeLinecap="round"
            strokeLinejoin="round"
            vectorEffect="non-scaling-stroke"
          />
        </svg>
      ) : null}

      {hint ? <p className="text-kt-sm text-fg-subtle">{hint}</p> : null}
    </Wrapper>
  );
}
