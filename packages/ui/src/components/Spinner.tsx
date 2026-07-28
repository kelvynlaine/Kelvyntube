import { forwardRef } from 'react';
import { cn } from '../cn';

export interface SpinnerProps {
  /** Diamètre en pixels. */
  size?: number;
  /** Épaisseur du trait. */
  strokeWidth?: number;
  className?: string;
  /** Libellé lu par les lecteurs d'écran (vide = purement décoratif). */
  label?: string;
}

/** Indicateur de chargement circulaire. */
export const Spinner = forwardRef<SVGSVGElement, SpinnerProps>(function Spinner(
  { size = 20, strokeWidth = 2.5, className, label },
  ref,
) {
  return (
    <svg
      ref={ref}
      width={size}
      height={size}
      viewBox="0 0 24 24"
      fill="none"
      className={cn('animate-spin text-current', className)}
      role={label ? 'status' : 'presentation'}
      aria-label={label || undefined}
      aria-hidden={label ? undefined : true}
    >
      <circle
        cx="12"
        cy="12"
        r="9"
        stroke="currentColor"
        strokeWidth={strokeWidth}
        opacity="0.25"
      />
      <path
        d="M21 12a9 9 0 0 0-9-9"
        stroke="currentColor"
        strokeWidth={strokeWidth}
        strokeLinecap="round"
      />
    </svg>
  );
});
