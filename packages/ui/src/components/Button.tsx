'use client';

import { forwardRef, type ButtonHTMLAttributes, type ReactNode } from 'react';
import { cn } from '../cn';
import { Spinner } from './Spinner';

export type ButtonVariant = 'primary' | 'secondary' | 'ghost' | 'brand' | 'outline';
export type ButtonSize = 'sm' | 'md' | 'lg';

export interface ButtonProps extends ButtonHTMLAttributes<HTMLButtonElement> {
  variant?: ButtonVariant;
  size?: ButtonSize;
  /** Affiche un spinner et désactive le bouton. */
  loading?: boolean;
  iconLeft?: ReactNode;
  iconRight?: ReactNode;
  fullWidth?: boolean;
}

/** Classes de base par variante (s'appuient sur les classes composées `.kt-btn-*`). */
const VARIANTS: Record<ButtonVariant, string> = {
  primary: 'kt-btn-primary',
  secondary: 'kt-btn-secondary',
  ghost:
    'kt-btn-ghost rounded-pill inline-flex items-center justify-center gap-2 font-medium',
  brand:
    'inline-flex items-center justify-center gap-2 rounded-pill bg-brand font-medium text-white transition-colors hover:bg-brand-hover disabled:opacity-50 kt-focus-ring',
  outline:
    'inline-flex items-center justify-center gap-2 rounded-pill border border-border-strong bg-transparent font-medium text-fg transition-colors hover:bg-bg-hover disabled:opacity-50 kt-focus-ring',
};

/**
 * `kt-tap-y` ne s'active que sur pointeur grossier : `sm` (32 px) et `md`
 * (36 px) passent alors à 44 px de haut. La largeur reste dictée par le texte,
 * donc rien ne bouge horizontalement. `lg` fait déjà 44 px.
 */
const SIZES: Record<ButtonSize, string> = {
  sm: 'h-8 px-3 py-0 text-kt-sm kt-tap-y',
  md: 'h-9 px-4 py-0 text-kt-base kt-tap-y',
  lg: 'h-11 px-6 py-0 text-kt-md',
};

const ICON_SIZE: Record<ButtonSize, number> = { sm: 14, md: 16, lg: 18 };

/** Bouton générique du design system. */
export const Button = forwardRef<HTMLButtonElement, ButtonProps>(function Button(
  {
    variant = 'secondary',
    size = 'md',
    loading = false,
    iconLeft,
    iconRight,
    fullWidth = false,
    disabled,
    className,
    children,
    type = 'button',
    ...rest
  },
  ref,
) {
  const isDisabled = disabled || loading;

  return (
    <button
      ref={ref}
      type={type}
      disabled={isDisabled}
      aria-busy={loading || undefined}
      className={cn(
        VARIANTS[variant],
        SIZES[size],
        'shrink-0 select-none whitespace-nowrap',
        fullWidth && 'w-full',
        isDisabled && 'cursor-not-allowed opacity-50',
        className,
      )}
      {...rest}
    >
      {loading ? (
        <Spinner size={ICON_SIZE[size]} />
      ) : (
        iconLeft && <span className="shrink-0 [&>svg]:block">{iconLeft}</span>
      )}
      {children}
      {iconRight && !loading && (
        <span className="shrink-0 [&>svg]:block">{iconRight}</span>
      )}
    </button>
  );
});
