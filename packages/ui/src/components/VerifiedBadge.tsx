import { cn } from '../cn';

export interface VerifiedBadgeProps {
  size?: number;
  className?: string;
  /** Libellé accessible (par défaut « Chaîne vérifiée »). */
  label?: string;
}

/** Pastille « vérifié » affichée après le nom d'une chaîne. */
export function VerifiedBadge({
  size = 14,
  className,
  label = 'Chaîne vérifiée',
}: VerifiedBadgeProps) {
  return (
    <svg
      width={size}
      height={size}
      viewBox="0 0 24 24"
      fill="currentColor"
      role="img"
      aria-label={label}
      className={cn('inline-block shrink-0 text-fg-muted', className)}
    >
      <path d="M12 2 9.9 4.4 6.8 3.7 6.2 6.8 3.1 7.4l.7 3.1L1.4 12l2.4 1.5-.7 3.1 3.1.6.6 3.1 3.1-.7L12 22l1.5-2.4 3.1.7.6-3.1 3.1-.6-.7-3.1L22.6 12l-2.4-2.1.7-3.1-3.1-.6-.6-3.1-3.1.7L12 2Zm-1.3 13.6-3.4-3.4 1.3-1.3 2.1 2.1 4.7-4.7 1.3 1.3-6 6Z" />
    </svg>
  );
}
