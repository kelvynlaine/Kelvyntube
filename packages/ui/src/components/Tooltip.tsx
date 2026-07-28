'use client';

import {
  cloneElement,
  isValidElement,
  useCallback,
  useEffect,
  useId,
  useRef,
  useState,
  type ReactElement,
  type ReactNode,
} from 'react';
import { cn } from '../cn';

export type TooltipSide = 'top' | 'bottom' | 'left' | 'right';

export interface TooltipProps {
  /** Contenu de l'infobulle (texte court). */
  content: ReactNode;
  side?: TooltipSide;
  /** Délai avant apparition, en ms. */
  delay?: number;
  /** Désactive complètement l'infobulle. */
  disabled?: boolean;
  className?: string;
  contentClassName?: string;
  children: ReactNode;
}

const SIDES: Record<TooltipSide, string> = {
  top: 'bottom-full left-1/2 -translate-x-1/2 mb-2',
  bottom: 'top-full left-1/2 -translate-x-1/2 mt-2',
  left: 'right-full top-1/2 -translate-y-1/2 mr-2',
  right: 'left-full top-1/2 -translate-y-1/2 ml-2',
};

/**
 * Infobulle affichée au survol et au focus clavier — sans dépendance externe.
 * L'enfant reçoit `aria-describedby` quand c'est un élément React valide.
 */
export function Tooltip({
  content,
  side = 'bottom',
  delay = 400,
  disabled = false,
  className,
  contentClassName,
  children,
}: TooltipProps) {
  const id = useId();
  const [open, setOpen] = useState(false);
  const timerRef = useRef<ReturnType<typeof setTimeout> | null>(null);

  const clearTimer = useCallback(() => {
    if (timerRef.current) {
      clearTimeout(timerRef.current);
      timerRef.current = null;
    }
  }, []);

  const show = useCallback(
    (immediate = false) => {
      if (disabled || !content) return;
      clearTimer();
      if (immediate || delay <= 0) setOpen(true);
      else timerRef.current = setTimeout(() => setOpen(true), delay);
    },
    [clearTimer, content, delay, disabled],
  );

  const hide = useCallback(() => {
    clearTimer();
    setOpen(false);
  }, [clearTimer]);

  // Nettoyage du minuteur au démontage
  useEffect(() => clearTimer, [clearTimer]);

  // Échap masque l'infobulle (recommandation WCAG 1.4.13)
  useEffect(() => {
    if (!open) return;
    const onKey = (event: KeyboardEvent) => {
      if (event.key === 'Escape') hide();
    };
    document.addEventListener('keydown', onKey);
    return () => document.removeEventListener('keydown', onKey);
  }, [open, hide]);

  const child =
    isValidElement(children) && open
      ? cloneElement(children as ReactElement<{ 'aria-describedby'?: string }>, {
          'aria-describedby': id,
        })
      : children;

  return (
    <span
      className={cn('relative inline-flex', className)}
      onPointerEnter={() => show()}
      onPointerLeave={hide}
      onFocus={() => show(true)}
      onBlur={hide}
    >
      {child}
      {open && !disabled && content ? (
        <span
          id={id}
          role="tooltip"
          className={cn(
            'pointer-events-none absolute z-50 max-w-56 animate-fade-in whitespace-nowrap rounded px-2 py-1',
            'bg-bg-inverse text-kt-xs font-medium text-fg-inverse shadow-lg',
            SIDES[side],
            contentClassName,
          )}
        >
          {content}
        </span>
      ) : null}
    </span>
  );
}
