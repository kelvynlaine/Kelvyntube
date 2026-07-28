'use client';

import { forwardRef, type ButtonHTMLAttributes, type ReactNode } from 'react';
import { cn } from '../cn';

export interface ChipProps extends ButtonHTMLAttributes<HTMLButtonElement> {
  /** État sélectionné (fond inversé façon YouTube). */
  active?: boolean;
  icon?: ReactNode;
}

/** Pastille de filtre horizontale. */
export const Chip = forwardRef<HTMLButtonElement, ChipProps>(function Chip(
  { active = false, icon, className, children, type = 'button', ...rest },
  ref,
) {
  return (
    <button
      ref={ref}
      type={type}
      aria-pressed={active}
      className={cn(
        // `.kt-chip` fait 32 px de haut (padding 6 px + interligne 20 px), ce
        // qui est sous le minimum tactile. `kt-tap-y` le porte à 44 px sur
        // pointeur grossier uniquement — la souris garde la pastille compacte
        // de YouTube. Le même correctif est appliqué en CSS à `.kt-chip` dans
        // `styles.css`, pour couvrir les usages bruts de la classe hors de ce
        // composant.
        'kt-chip inline-flex items-center gap-1.5 kt-tap-y',
        active && 'kt-chip-active',
        className,
      )}
      {...rest}
    >
      {icon}
      {children}
    </button>
  );
});
