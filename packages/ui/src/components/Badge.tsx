import { forwardRef, type HTMLAttributes, type ReactNode } from 'react';
import { cn } from '../cn';

export type BadgeVariant = 'default' | 'brand' | 'success' | 'live' | 'new';

export interface BadgeProps extends HTMLAttributes<HTMLSpanElement> {
  variant?: BadgeVariant;
  icon?: ReactNode;
  children?: ReactNode;
}

const VARIANTS: Record<BadgeVariant, string> = {
  default: 'bg-bg-elevated text-fg-muted',
  brand: 'bg-brand text-white',
  success: 'bg-success/15 text-success',
  live: 'bg-brand text-white',
  new: 'bg-accent/60 text-accent-fg',
};

/** Pastille d'état (Nouveau, En direct, Vérifié…). */
export const Badge = forwardRef<HTMLSpanElement, BadgeProps>(function Badge(
  { variant = 'default', icon, className, children, ...rest },
  ref,
) {
  return (
    <span
      ref={ref}
      className={cn(
        'inline-flex shrink-0 items-center gap-1 rounded-pill px-1.5 py-0.5 text-kt-xs font-medium leading-4',
        VARIANTS[variant],
        className,
      )}
      {...rest}
    >
      {variant === 'live' && (
        <span
          aria-hidden="true"
          className="size-1.5 rounded-full bg-white/90"
        />
      )}
      {icon}
      {children}
    </span>
  );
});
