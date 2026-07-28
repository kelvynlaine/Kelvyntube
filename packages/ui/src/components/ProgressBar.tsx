import type { ReactNode } from 'react';
import { cn } from '../cn';

export type ProgressVariant = 'brand' | 'accent' | 'success';

export interface ProgressBarProps {
  /** Valeur courante (ignorée si `indeterminate`). */
  value?: number;
  max?: number;
  /** Barre défilante quand la progression est inconnue. */
  indeterminate?: boolean;
  label?: ReactNode;
  /** Affiche le pourcentage à droite du libellé. */
  showValue?: boolean;
  size?: 'sm' | 'md';
  variant?: ProgressVariant;
  className?: string;
  /** `aria-label` quand aucun libellé visible n'est fourni. */
  ariaLabel?: string;
}

const FILLS: Record<ProgressVariant, string> = {
  brand: 'bg-brand',
  accent: 'bg-accent-fg',
  success: 'bg-success',
};

/** Barre de progression déterminée ou indéterminée (traitement d'upload). */
export function ProgressBar({
  value = 0,
  max = 100,
  indeterminate = false,
  label,
  showValue = false,
  size = 'md',
  variant = 'brand',
  className,
  ariaLabel,
}: ProgressBarProps) {
  const pct = max > 0 ? Math.min(100, Math.max(0, (value / max) * 100)) : 0;

  return (
    <div className={cn('flex w-full flex-col gap-1.5', className)}>
      {label || showValue ? (
        <div className="flex items-center justify-between gap-2 text-kt-sm">
          {label ? <span className="text-fg-muted">{label}</span> : <span />}
          {showValue && !indeterminate ? (
            <span className="tabular-nums text-fg">{Math.round(pct)} %</span>
          ) : null}
        </div>
      ) : null}

      <div
        role="progressbar"
        aria-label={label ? undefined : (ariaLabel ?? 'Progression')}
        aria-valuemin={indeterminate ? undefined : 0}
        aria-valuemax={indeterminate ? undefined : max}
        aria-valuenow={indeterminate ? undefined : Math.round(value)}
        className={cn(
          'relative w-full overflow-hidden rounded-pill bg-bg-active',
          size === 'sm' ? 'h-1' : 'h-2',
        )}
      >
        {indeterminate ? (
          <div
            className={cn(
              'absolute inset-y-0 w-1/3 -translate-x-full animate-shimmer rounded-pill',
              FILLS[variant],
            )}
          />
        ) : (
          <div
            className={cn(
              'h-full rounded-pill transition-[width] duration-300 ease-kt',
              FILLS[variant],
            )}
            style={{ width: `${pct}%` }}
          />
        )}
      </div>
    </div>
  );
}
