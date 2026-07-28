'use client';

import { X } from 'lucide-react';
import { useEffect, useId, useRef, useState, type ReactNode } from 'react';
import { createPortal } from 'react-dom';
import { cn } from '../cn';
import { useFocusTrap } from '../hooks/useFocusTrap';
import { useLockBodyScroll } from '../hooks/useLockBodyScroll';
import { IconButton } from './IconButton';

export type ModalSize = 'sm' | 'md' | 'lg' | 'full';

export interface ModalProps {
  open: boolean;
  onClose: () => void;
  title?: ReactNode;
  description?: ReactNode;
  size?: ModalSize;
  children?: ReactNode;
  /** Zone d'actions en pied de boîte de dialogue. */
  footer?: ReactNode;
  closeOnOverlayClick?: boolean;
  hideCloseButton?: boolean;
  /** `aria-label` si aucun `title` n'est fourni. */
  ariaLabel?: string;
  className?: string;
  overlayClassName?: string;
  bodyClassName?: string;
}

/**
 * Largeurs maximales appliquées à partir de `xs` (480 px) seulement.
 * Sous ce seuil la modale est volontairement pleine largeur et ancrée en bas
 * (feuille montante) : une carte centrée de 320 px sur un téléphone laisse un
 * corps de texte illisible et gaspille la moitié de la hauteur utile.
 * Au-dessus de 480 px on retrouve exactement la carte centrée d'origine.
 */
const SIZES: Record<ModalSize, string> = {
  sm: 'xs:max-w-sm',
  md: 'xs:max-w-lg',
  lg: 'xs:max-w-3xl',
  full: 'h-full w-full max-w-none rounded-none',
};

/** Boîte de dialogue modale : overlay, piège de focus, Échap, scroll verrouillé. */
export function Modal({
  open,
  onClose,
  title,
  description,
  size = 'md',
  children,
  footer,
  closeOnOverlayClick = true,
  hideCloseButton = false,
  ariaLabel,
  className,
  overlayClassName,
  bodyClassName,
}: ModalProps) {
  const rawId = useId().replace(/[^a-zA-Z0-9_-]/g, '');
  const titleId = `kt-modal-title-${rawId}`;
  const descId = `kt-modal-desc-${rawId}`;
  const panelRef = useRef<HTMLDivElement | null>(null);
  const [mounted, setMounted] = useState(false);

  useEffect(() => setMounted(true), []);
  useLockBodyScroll(open);
  // `mounted` est indispensable : le portail n'existe pas au premier rendu
  useFocusTrap(panelRef, open && mounted);

  // Échap ferme la modale
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
    <div
      className={cn(
        'fixed inset-0 z-[100] flex justify-center animate-fade-in',
        size === 'full'
          ? 'items-center p-0'
          : 'items-end p-0 xs:items-center xs:p-4',
        overlayClassName,
      )}
    >
      {/* Voile : le clic ferme (si autorisé) */}
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
        aria-describedby={description ? descId : undefined}
        className={cn(
          'relative flex max-h-full w-full flex-col overflow-hidden rounded-kt-lg',
          'border border-border bg-bg-elevated shadow-2xl animate-slide-up',
          size !== 'full' &&
            // Feuille montante sous 480 px : coins bas droits (elle touche le
            // bord), 92 % de la hauteur *visible* (`dvh` tient compte de la
            // barre d'URL mobile) et retrait de sécurité en bas pour ne pas
            // passer sous l'indicateur d'accueil iOS.
            'max-h-[92dvh] rounded-b-none pb-[env(safe-area-inset-bottom)] xs:max-h-full xs:rounded-b-kt-lg xs:pb-0',
          SIZES[size],
          className,
        )}
      >
        {(title || !hideCloseButton) && (
          // Gouttières réduites sous 480 px : 2 × 24 px de marge, c'est 15 %
          // de la largeur d'un écran de 320 px.
          <header className="flex items-start gap-3 px-4 pb-2 pt-4 xs:gap-4 xs:px-6 xs:pt-5">
            <div className="min-w-0 flex-1">
              {title ? (
                <h2 id={titleId} className="text-kt-lg font-medium text-fg">
                  {title}
                </h2>
              ) : null}
              {description ? (
                <p id={descId} className="mt-1 text-kt-base text-fg-muted">
                  {description}
                </p>
              ) : null}
            </div>
            {!hideCloseButton && (
              <IconButton
                aria-label="Fermer"
                size="sm"
                onClick={onClose}
                className="-mr-2 -mt-1"
              >
                <X size={20} />
              </IconButton>
            )}
          </header>
        )}

        {/* `overscroll-contain` : le geste de défilement s'arrête au bord du
            corps de la modale au lieu de faire défiler la page derrière. */}
        <div
          className={cn(
            'kt-scroll flex-1 overflow-y-auto overscroll-contain px-4 py-4 xs:px-6',
            bodyClassName,
          )}
        >
          {children}
        </div>

        {footer ? (
          // `flex-wrap` : deux boutons de 44 px et leurs libellés ne tiennent
          // pas toujours sur une ligne à 320 px.
          <footer className="flex flex-wrap items-center justify-end gap-2 border-t border-border px-4 py-3 xs:px-6 xs:py-4">
            {footer}
          </footer>
        ) : null}
      </div>
    </div>,
    document.body,
  );
}
