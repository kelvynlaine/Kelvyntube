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
  /**
   * Stratégie de cible tactile appliquée UNIQUEMENT sur pointeur grossier
   * (doigt) — le rendu souris est identique dans les deux cas.
   * - `grow` (défaut) : la boîte atteint réellement 44 × 44 px. C'est le cas
   *   général : un bouton icône est presque toujours seul dans sa rangée.
   * - `halo` : la boîte garde sa taille et un `::after` transparent porte la
   *   zone sensible à 44 × 44. À réserver aux rangées denses où 12 px de plus
   *   seraient pris sur une colonne de texte déjà courte (menu « ⋮ » d'une
   *   carte vidéo compacte sur téléphone).
   */
  touchTarget?: 'grow' | 'halo';
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
      touchTarget = 'grow',
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
          // 32/40 px suffisent à la souris mais pas au doigt : on porte la
          // cible à 44 px au doigt seulement (cf. styles.css).
          touchTarget === 'grow' ? 'kt-tap' : 'kt-tap-halo',
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
