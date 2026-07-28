'use client';

import { forwardRef, type ButtonHTMLAttributes, type ReactNode } from 'react';
import { cn } from '../cn';
import { Spinner } from './Spinner';
import { Tooltip, type TooltipSide } from './Tooltip';

export type IconButtonSize = 'sm' | 'md' | 'lg';
export type IconButtonVariant = 'ghost' | 'solid' | 'brand' | 'overlay';

export interface IconButtonProps
  extends Omit<ButtonHTMLAttributes<HTMLButtonElement>, 'aria-label'> {
  /** Obligatoire : ces boutons n'ont pas de texte visible. */
  'aria-label': string;
  /** Infobulle affichée au survol / focus (par défaut : aucune). */
  tooltip?: ReactNode;
  tooltipSide?: TooltipSide;
  size?: IconButtonSize;
  variant?: IconButtonVariant;
  /** État enfoncé (menu ouvert, filtre actif…). */
  active?: boolean;
  loading?: boolean;
  children: ReactNode;
}

const SIZES: Record<IconButtonSize, string> = {
  sm: 'size-8',
  md: 'size-10',
  lg: 'size-12',
};

const SPINNER: Record<IconButtonSize, number> = { sm: 14, md: 18, lg: 22 };

const VARIANTS: Record<IconButtonVariant, string> = {
  ghost: 'text-fg hover:bg-bg-hover active:bg-bg-active',
  solid: 'bg-bg-elevated text-fg hover:bg-bg-active',
  brand: 'bg-brand text-white hover:bg-brand-hover',
  overlay: 'bg-black/60 text-white hover:bg-black/80',
};

/** Bouton rond ne contenant qu'une icône — `aria-label` requis par le typage. */
export const IconButton = forwardRef<HTMLButtonElement, IconButtonProps>(
  function IconButton(
    {
      tooltip,
      tooltipSide = 'bottom',
      size = 'md',
      variant = 'ghost',
      active = false,
      loading = false,
      disabled,
      className,
      children,
      type = 'button',
      ...rest
    },
    ref,
  ) {
    const button = (
      <button
        ref={ref}
        type={type}
        disabled={disabled || loading}
        aria-busy={loading || undefined}
        className={cn(
          'inline-flex shrink-0 items-center justify-center rounded-full p-0',
          'transition-colors duration-150 kt-focus-ring',
          SIZES[size],
          VARIANTS[variant],
          active && 'bg-bg-active',
          (disabled || loading) && 'cursor-not-allowed opacity-50',
          className,
        )}
        {...rest}
      >
        {loading ? <Spinner size={SPINNER[size]} /> : children}
      </button>
    );

    if (!tooltip) return button;

    return (
      <Tooltip content={tooltip} side={tooltipSide}>
        {button}
      </Tooltip>
    );
  },
);
