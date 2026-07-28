'use client';

import { X } from 'lucide-react';
import { useEffect, useId, useRef, useState, type ReactNode } from 'react';
import { createPortal } from 'react-dom';
import { cn } from '../cn';
import { useFocusTrap } from '../hooks/useFocusTrap';
import { useLockBodyScroll } from '../hooks/useLockBodyScroll';
import { IconButton } from './IconButton';

export type SheetSide = 'left' | 'right' | 'bottom';

export interface SheetProps {
  open: boolean;
  onClose: () => void;
  side?: SheetSide;
  title?: ReactNode;
  children?: ReactNode;
  footer?: ReactNode;
  /** Largeur (côtés gauche/droite) ou hauteur (bas) — classe Tailwind. */
  sizeClassName?: string;
  closeOnOverlayClick?: boolean;
  hideCloseButton?: boolean;
  ariaLabel?: string;
  className?: string;
  overlayClassName?: string;
}

/**
 * Chaque côté colle à un bord physique de l'écran : on y ajoute le retrait de
 * sécurité correspondant (encoche en paysage à gauche/droite, indicateur
 * d'accueil en bas), sinon le contenu passe sous le matériel sur iPhone.
 */
const SIDES: Record<SheetSide, string> = {
  left: 'left-0 top-0 h-full animate-slide-in-left border-r pl-[env(safe-area-inset-left)]',
  right:
    'right-0 top-0 h-full animate-fade-in border-l pr-[env(safe-area-inset-right)]',
  bottom:
    'bottom-0 left-0 w-full rounded-t-kt-lg border-t animate-slide-up pb-[env(safe-area-inset-bottom)]',
};

/**
 * Largeurs par défaut. `min(…, 85vw)` garantit qu'une bande de l'écran reste
 * visible et touchable pour refermer le panneau, y compris à 320 px.
 * `dvh` plutôt que `vh` pour le panneau bas : la barre d'URL mobile rognait
 * sinon le pied de page.
 */
const DEFAULT_SIZE: Record<SheetSide, string> = {
  left: 'w-[min(320px,85vw)]',
  right: 'w-[min(400px,85vw)]',
  bottom: 'max-h-[85dvh]',
};

/** Panneau latéral coulissant (menu mobile, partage, filtres…). */
export function Sheet({
  open,
  onClose,
  side = 'left',
  title,
  children,
  footer,
  sizeClassName,
  closeOnOverlayClick = true,
  hideCloseButton = false,
  ariaLabel,
  className,
  overlayClassName,
}: SheetProps) {
  const rawId = useId().replace(/[^a-zA-Z0-9_-]/g, '');
  const titleId = `kt-sheet-title-${rawId}`;
  const panelRef = useRef<HTMLDivElement | null>(null);
  const [mounted, setMounted] = useState(false);

  useEffect(() => setMounted(true), []);
  useLockBodyScroll(open);
  // `mounted` est indispensable : le portail n'existe pas au premier rendu
  useFocusTrap(panelRef, open && mounted);

  useEffect(() => {
    if (!open) return;
    const onKeyDown = (event: KeyboardEvent) => {
      if (event.key === 'Escape') {
        event.stopPropagation();
        onClose();
      }
    };
    document.addEventListener('keydown', onKeyDown);
    return () => document.removeEventListener('keydown', onKeyDown);
  }, [open, onClose]);

  if (!open || !mounted) return null;

  return createPortal(
    <div className={cn('fixed inset-0 z-[100] animate-fade-in', overlayClassName)}>
      <div
        aria-hidden="true"
        onClick={closeOnOverlayClick ? onClose : undefined}
        className="absolute inset-0 bg-black/70"
      />

      <div
        ref={panelRef}
        role="dialog"
        aria-modal="true"
        aria-label={title ? undefined : ariaLabel}
        aria-labelledby={title ? titleId : undefined}
        className={cn(
          'absolute flex flex-col overflow-hidden border-border bg-bg shadow-2xl',
          SIDES[side],
          sizeClassName ?? DEFAULT_SIZE[side],
          className,
        )}
      >
        {(title || !hideCloseButton) && (
          <header className="flex items-center gap-3 border-b border-border px-4 py-3">
            {!hideCloseButton && (
              <IconButton aria-label="Fermer" size="sm" onClick={onClose}>
                <X size={20} />
              </IconButton>
            )}
            {title ? (
              <h2 id={titleId} className="min-w-0 flex-1 truncate text-kt-md font-medium text-fg">
                {title}
              </h2>
            ) : null}
          </header>
        )}

        {/* `overscroll-contain` : le panneau capture son propre défilement,
            la page en arrière-plan ne bouge plus (« scroll chaining »). */}
        <div className="kt-scroll flex-1 overflow-y-auto overscroll-contain">
          {children}
        </div>

        {footer ? (
          <footer className="border-t border-border px-4 py-3">{footer}</footer>
        ) : null}
      </div>
    </div>,
    document.body,
  );
}
