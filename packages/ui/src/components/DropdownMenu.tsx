'use client';

import { Check } from 'lucide-react';
import {
  useCallback,
  useEffect,
  useId,
  useMemo,
  useRef,
  useState,
  type KeyboardEvent as ReactKeyboardEvent,
  type ReactNode,
  type RefObject,
} from 'react';
import { cn } from '../cn';
import { useOnClickOutside } from '../hooks/useOnClickOutside';

export interface DropdownMenuItem {
  /** Identifiant stable ; à défaut le libellé sert de clé. */
  id?: string;
  label?: ReactNode;
  icon?: ReactNode;
  /** Texte secondaire (ex. description d'un niveau de notification). */
  description?: ReactNode;
  onSelect?: () => void;
  /** Style destructif (rouge). */
  danger?: boolean;
  /** Rend un séparateur au lieu d'un élément cliquable. */
  separator?: boolean;
  /** Présent = élément à cocher (`role="menuitemradio"`). */
  checked?: boolean;
  disabled?: boolean;
  /** Ferme le menu après sélection (vrai par défaut). */
  closeOnSelect?: boolean;
}

/** Props à répandre sur un déclencheur personnalisé. */
export interface DropdownTriggerRenderProps {
  ref: RefObject<HTMLButtonElement | null>;
  id: string;
  onClick: () => void;
  onKeyDown: (event: ReactKeyboardEvent<HTMLButtonElement>) => void;
  'aria-haspopup': 'menu';
  'aria-expanded': boolean;
  'aria-controls': string | undefined;
}

export interface DropdownMenuProps {
  /**
   * Contenu du déclencheur. Passer une fonction pour fournir son propre bouton
   * (évite l'imbrication de `<button>`).
   */
  trigger: ReactNode | ((props: DropdownTriggerRenderProps) => ReactNode);
  items: DropdownMenuItem[];
  /** Alignement horizontal du panneau par rapport au déclencheur. */
  align?: 'start' | 'end';
  /** Côté d'ouverture. */
  side?: 'top' | 'bottom';
  /** `aria-label` du menu. */
  label?: string;
  /** `aria-label` du déclencheur par défaut. */
  triggerLabel?: string;
  className?: string;
  triggerClassName?: string;
  menuClassName?: string;
  /** Mode contrôlé. */
  open?: boolean;
  onOpenChange?: (open: boolean) => void;
  disabled?: boolean;
}

/**
 * Menu déroulant accessible : navigation aux flèches, Échap, Tab,
 * fermeture au clic extérieur, `role="menu"`.
 */
export function DropdownMenu({
  trigger,
  items,
  align = 'end',
  side = 'bottom',
  label = 'Menu',
  triggerLabel = 'Ouvrir le menu',
  className,
  triggerClassName,
  menuClassName,
  open: controlledOpen,
  onOpenChange,
  disabled = false,
}: DropdownMenuProps) {
  const reactId = useId().replace(/[^a-zA-Z0-9_-]/g, '');
  const menuId = `kt-menu-${reactId}`;
  const triggerId = `kt-menu-trigger-${reactId}`;

  const [uncontrolledOpen, setUncontrolledOpen] = useState(false);
  const open = controlledOpen ?? uncontrolledOpen;

  const [activeIndex, setActiveIndex] = useState(-1);
  const wrapperRef = useRef<HTMLDivElement | null>(null);
  const triggerRef = useRef<HTMLButtonElement | null>(null);
  const menuRef = useRef<HTMLDivElement | null>(null);
  const itemRefs = useRef<(HTMLButtonElement | null)[]>([]);

  /**
   * Correction horizontale appliquée au panneau, en pixels.
   * Le menu est positionné en CSS pure (`left-0` / `right-0`) : sur un écran
   * large ça suffit toujours, mais sur téléphone un déclencheur situé près
   * d'un bord projette un panneau de 224 px hors du viewport — il devient
   * alors partiellement inatteignable et provoque un débordement horizontal
   * de la page. On mesure donc après ouverture et on décale du strict
   * nécessaire pour rentrer, en gardant 8 px de marge.
   */
  const [shiftX, setShiftX] = useState(0);
  const shiftRef = useRef(0);

  /** Indices des éléments réellement focusables. */
  const focusables = useMemo(
    () =>
      items
        .map((item, index) => (!item.separator && !item.disabled ? index : -1))
        .filter((index) => index >= 0),
    [items],
  );

  const setOpen = useCallback(
    (next: boolean) => {
      if (controlledOpen === undefined) setUncontrolledOpen(next);
      onOpenChange?.(next);
      if (!next) setActiveIndex(-1);
    },
    [controlledOpen, onOpenChange],
  );

  const close = useCallback(
    (refocus = true) => {
      setOpen(false);
      if (refocus) triggerRef.current?.focus();
    },
    [setOpen],
  );

  const handleOutside = useCallback(() => setOpen(false), [setOpen]);
  useOnClickOutside(wrapperRef, handleOutside, open);

  // Place le focus sur l'élément actif
  useEffect(() => {
    if (!open || activeIndex < 0) return;
    itemRefs.current[activeIndex]?.focus();
  }, [open, activeIndex]);

  // Recalage anti-débordement du panneau
  useEffect(() => {
    if (!open) {
      shiftRef.current = 0;
      setShiftX(0);
      return;
    }

    const adjust = () => {
      const el = menuRef.current;
      if (!el) return;

      // La mesure inclut le décalage déjà appliqué : on le soustrait pour
      // raisonner sur la position « naturelle ». Le calcul est ainsi
      // idempotent — une rotation d'écran qui libère de la place ramène
      // spontanément le panneau à zéro au lieu de rester décalé.
      const applied = shiftRef.current;
      const rect = el.getBoundingClientRect();
      const naturalLeft = rect.left - applied;
      const naturalRight = rect.right - applied;
      const margin = 8;

      let next = 0;
      if (naturalRight > window.innerWidth - margin) {
        next = window.innerWidth - margin - naturalRight;
      }
      // Le bord gauche prime : mieux vaut rogner à droite que rendre le début
      // des libellés inaccessible.
      if (naturalLeft + next < margin) next = margin - naturalLeft;

      shiftRef.current = next;
      setShiftX(next);
    };

    adjust();
    window.addEventListener('resize', adjust);
    return () => window.removeEventListener('resize', adjust);
  }, [open, items.length]);

  const openWith = useCallback(
    (position: 'first' | 'last' | 'none') => {
      setOpen(true);
      if (position === 'first') setActiveIndex(focusables[0] ?? -1);
      else if (position === 'last')
        setActiveIndex(focusables[focusables.length - 1] ?? -1);
    },
    [focusables, setOpen],
  );

  const move = useCallback(
    (delta: number) => {
      if (focusables.length === 0) return;
      const current = focusables.indexOf(activeIndex);
      const next =
        current === -1
          ? delta > 0
            ? 0
            : focusables.length - 1
          : (current + delta + focusables.length) % focusables.length;
      setActiveIndex(focusables[next]);
    },
    [activeIndex, focusables],
  );

  const onTriggerKeyDown = useCallback(
    (event: ReactKeyboardEvent<HTMLButtonElement>) => {
      if (event.key === 'ArrowDown') {
        event.preventDefault();
        openWith('first');
      } else if (event.key === 'ArrowUp') {
        event.preventDefault();
        openWith('last');
      } else if (event.key === 'Escape' && open) {
        event.preventDefault();
        close();
      }
    },
    [close, open, openWith],
  );

  const onMenuKeyDown = useCallback(
    (event: ReactKeyboardEvent<HTMLDivElement>) => {
      switch (event.key) {
        case 'ArrowDown':
          event.preventDefault();
          move(1);
          break;
        case 'ArrowUp':
          event.preventDefault();
          move(-1);
          break;
        case 'Home':
          event.preventDefault();
          setActiveIndex(focusables[0] ?? -1);
          break;
        case 'End':
          event.preventDefault();
          setActiveIndex(focusables[focusables.length - 1] ?? -1);
          break;
        case 'Escape':
          event.preventDefault();
          close();
          break;
        case 'Tab':
          // Tab ferme le menu et laisse le focus suivre l'ordre naturel
          setOpen(false);
          break;
        default:
          break;
      }
    },
    [close, focusables, move, setOpen],
  );

  const handleSelect = useCallback(
    (item: DropdownMenuItem) => {
      if (item.disabled) return;
      item.onSelect?.();
      if (item.closeOnSelect !== false) close();
    },
    [close],
  );

  const triggerProps: DropdownTriggerRenderProps = {
    ref: triggerRef,
    id: triggerId,
    onClick: () => (open ? close(false) : openWith('none')),
    onKeyDown: onTriggerKeyDown,
    'aria-haspopup': 'menu',
    'aria-expanded': open,
    'aria-controls': open ? menuId : undefined,
  };

  return (
    <div ref={wrapperRef} className={cn('relative inline-flex', className)}>
      {typeof trigger === 'function' ? (
        trigger(triggerProps)
      ) : (
        <button
          ref={triggerRef}
          id={triggerId}
          type="button"
          disabled={disabled}
          aria-label={triggerLabel}
          aria-haspopup="menu"
          aria-expanded={open}
          aria-controls={open ? menuId : undefined}
          onClick={triggerProps.onClick}
          onKeyDown={onTriggerKeyDown}
          className={cn(
            'inline-flex items-center justify-center rounded-full kt-tap-y kt-focus-ring',
            triggerClassName,
          )}
        >
          {trigger}
        </button>
      )}

      {open ? (
        <div
          ref={menuRef}
          id={menuId}
          role="menu"
          aria-label={label}
          aria-labelledby={triggerId}
          onKeyDown={onMenuKeyDown}
          style={shiftX ? { transform: `translateX(${shiftX}px)` } : undefined}
          className={cn(
            'absolute z-50 animate-slide-up overflow-hidden rounded-kt border border-border',
            'bg-bg-elevated py-2 shadow-xl',
            // La largeur minimale de 224 px est conservée tant que le viewport
            // le permet ; en dessous elle cède, sinon le panneau serait plus
            // large que l'écran avant même le recalage horizontal.
            'min-w-[min(14rem,calc(100vw-2rem))] max-w-[calc(100vw-1rem)]',
            side === 'bottom' ? 'top-full mt-1' : 'bottom-full mb-1',
            align === 'end' ? 'right-0' : 'left-0',
            menuClassName,
          )}
        >
          {items.map((item, index) => {
            const key = item.id ?? `${index}`;

            if (item.separator) {
              return (
                <div
                  key={key}
                  role="separator"
                  className="my-2 h-px bg-border"
                />
              );
            }

            const role = item.checked === undefined ? 'menuitem' : 'menuitemradio';

            return (
              <button
                key={key}
                ref={(el) => {
                  itemRefs.current[index] = el;
                }}
                type="button"
                role={role}
                tabIndex={activeIndex === index ? 0 : -1}
                disabled={item.disabled}
                aria-checked={item.checked}
                onClick={() => handleSelect(item)}
                onMouseEnter={() => setActiveIndex(index)}
                className={cn(
                  'flex w-full items-center gap-3 px-4 py-2 text-left text-kt-base transition-colors',
                  'kt-tap-y hover:bg-bg-hover focus:bg-bg-hover focus:outline-none',
                  item.danger ? 'text-danger' : 'text-fg',
                  item.disabled && 'cursor-not-allowed opacity-40',
                )}
              >
                {item.checked !== undefined ? (
                  <span aria-hidden="true" className="flex w-4 shrink-0">
                    {item.checked ? <Check size={16} /> : null}
                  </span>
                ) : item.icon ? (
                  <span aria-hidden="true" className="flex shrink-0 text-fg-muted">
                    {item.icon}
                  </span>
                ) : null}

                <span className="flex min-w-0 flex-col">
                  <span className="truncate">{item.label}</span>
                  {item.description ? (
                    <span className="truncate text-kt-sm text-fg-subtle">
                      {item.description}
                    </span>
                  ) : null}
                </span>
              </button>
            );
          })}
        </div>
      ) : null}
    </div>
  );
}
