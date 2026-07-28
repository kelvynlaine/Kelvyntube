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

const SIZES: Record<ModalSize, string> = {
  sm: 'max-w-sm',
  md: 'max-w-lg',
  lg: 'max-w-3xl',
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
        'fixed inset-0 z-[100] flex items-center justify-center p-4 animate-fade-in',
        size === 'full' && 'p-0',
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
          SIZES[size],
          className,
        )}
      >
        {(title || !hideCloseButton) && (
          <header className="flex items-start gap-4 px-6 pb-2 pt-5">
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

        <div className={cn('kt-scroll flex-1 overflow-y-auto px-6 py-4', bodyClassName)}>
          {children}
        </div>

        {footer ? (
          <footer className="flex items-center justify-end gap-2 border-t border-border px-6 py-4">
            {footer}
          </footer>
        ) : null}
      </div>
    </div>,
    document.body,
  );
}
