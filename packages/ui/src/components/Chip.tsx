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
        'kt-chip inline-flex items-center gap-1.5',
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
