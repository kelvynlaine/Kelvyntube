'use client';

import { AlertTriangle, CheckCircle2, Info, X } from 'lucide-react';
import {
  createContext,
  useCallback,
  useContext,
  useEffect,
  useMemo,
  useRef,
  useState,
  type ReactNode,
} from 'react';
import { createPortal } from 'react-dom';
import { cn } from '../cn';

export type ToastVariant = 'default' | 'success' | 'error' | 'info';

export interface ToastOptions {
  /** Identifiant explicite (permet de remplacer un toast existant). */
  id?: string;
  title?: ReactNode;
  /** Message principal. */
  message: ReactNode;
  variant?: ToastVariant;
  /** Durée avant fermeture automatique, en ms (0 = permanent). */
  duration?: number;
  /** Bouton d'action à droite du message (ex. « Annuler »). */
  action?: { label: string; onClick: () => void };
}

export interface ToastItem extends ToastOptions {
  id: string;
}

export interface ToastContextValue {
  /** Affiche un toast et renvoie son identifiant. */
  toast: (options: ToastOptions | string) => string;
  dismiss: (id: string) => void;
  dismissAll: () => void;
  toasts: ToastItem[];
}

const ToastContext = createContext<ToastContextValue | null>(null);

export interface ToastProviderProps {
  children: ReactNode;
  /** Durée par défaut avant fermeture automatique (ms). */
  duration?: number;
  /** Nombre maximum de toasts empilés. */
  max?: number;
  className?: string;
}

let counter = 0;

/** Fournit le contexte de notifications et rend la pile en bas à gauche. */
export function ToastProvider({
  children,
  duration = 5000,
  max = 3,
  className,
}: ToastProviderProps) {
  const [toasts, setToasts] = useState<ToastItem[]>([]);
  const [mounted, setMounted] = useState(false);

  useEffect(() => setMounted(true), []);

  const dismiss = useCallback((id: string) => {
    setToasts((current) => current.filter((item) => item.id !== id));
  }, []);

  const dismissAll = useCallback(() => setToasts([]), []);

  const toast = useCallback(
    (options: ToastOptions | string) => {
      const normalized: ToastOptions =
        typeof options === 'string' ? { message: options } : options;
      counter += 1;
      const id = normalized.id ?? `kt-toast-${counter}`;
      const item: ToastItem = {
        duration,
        variant: 'default',
        ...normalized,
        id,
      };
      setToasts((current) => {
        const next = current.filter((existing) => existing.id !== id);
        next.push(item);
        return next.slice(-max);
      });
      return id;
    },
    [duration, max],
  );

  const value = useMemo<ToastContextValue>(
    () => ({ toast, dismiss, dismissAll, toasts }),
    [toast, dismiss, dismissAll, toasts],
  );

  return (
    <ToastContext.Provider value={value}>
      {children}
      {mounted
        ? createPortal(
            <div
              aria-live="polite"
              aria-relevant="additions"
              className={cn(
                // La pile est remontée du retrait de sécurité bas : sinon les
                // toasts passent sous l'indicateur d'accueil iOS (et sous la
                // `BottomNav`, qui occupe déjà cette bande sur mobile).
                'pointer-events-none fixed left-4 z-[200] flex w-[min(360px,calc(100vw-2rem))] flex-col gap-2',
                'bottom-[calc(1rem+env(safe-area-inset-bottom))] feed-3:bottom-4',
                className,
              )}
            >
              {toasts.map((item) => (
                <Toast key={item.id} {...item} onDismiss={dismiss} />
              ))}
            </div>,
            document.body,
          )
        : null}
    </ToastContext.Provider>
  );
}

/** Accès à l'API de notifications. Nécessite un `<ToastProvider>` parent. */
export function useToast(): ToastContextValue {
  const context = useContext(ToastContext);
  if (!context) {
    throw new Error('useToast doit être utilisé dans un <ToastProvider>.');
  }
  return context;
}

export interface ToastProps extends ToastItem {
  onDismiss: (id: string) => void;
}

const ICONS: Record<ToastVariant, ReactNode> = {
  default: null,
  success: <CheckCircle2 size={18} className="text-success" />,
  error: <AlertTriangle size={18} className="text-danger" />,
  info: <Info size={18} className="text-accent-fg" />,
};

/** Notification unitaire (utilisable seule pour des cas très spécifiques). */
export function Toast({
  id,
  title,
  message,
  variant = 'default',
  duration = 5000,
  action,
  onDismiss,
}: ToastProps) {
  const timerRef = useRef<ReturnType<typeof setTimeout> | null>(null);
  const [paused, setPaused] = useState(false);

  useEffect(() => {
    if (!duration || paused) return;
    timerRef.current = setTimeout(() => onDismiss(id), duration);
    return () => {
      if (timerRef.current) clearTimeout(timerRef.current);
    };
  }, [duration, id, onDismiss, paused]);

  return (
    <div
      role="status"
      onPointerEnter={() => setPaused(true)}
      onPointerLeave={() => setPaused(false)}
      className={cn(
        'pointer-events-auto flex items-start gap-3 rounded-kt border border-border',
        'bg-bg-elevated px-4 py-3 text-kt-base text-fg shadow-xl animate-slide-up',
      )}
    >
      {ICONS[variant] ? (
        <span className="mt-0.5 shrink-0">{ICONS[variant]}</span>
      ) : null}

      <div className="min-w-0 flex-1">
        {title ? <p className="font-medium">{title}</p> : null}
        <p className="text-fg-muted">{message}</p>
      </div>

      {action ? (
        <button
          type="button"
          onClick={() => {
            action.onClick();
            onDismiss(id);
          }}
          className="inline-flex shrink-0 items-center rounded px-1 text-kt-base font-medium text-accent-fg kt-tap-y hover:underline kt-focus-ring"
        >
          {action.label}
        </button>
      ) : null}

      <button
        type="button"
        aria-label="Fermer la notification"
        onClick={() => onDismiss(id)}
        // `halo` : un toast fait 3 lignes de haut au maximum, une croix de
        // 44 px y serait disproportionnée. Le pseudo-élément donne la zone
        // tactile sans changer le dessin.
        className="inline-flex shrink-0 items-center justify-center rounded-full p-1 text-fg-muted transition-colors kt-tap-halo hover:bg-bg-hover hover:text-fg kt-focus-ring"
      >
        <X size={16} />
      </button>
    </div>
  );
}
