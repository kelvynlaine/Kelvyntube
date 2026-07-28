'use client';

import { useCallback, useRef, type KeyboardEvent, type ReactNode } from 'react';
import { cn } from '../cn';

export interface TabItem {
  id: string;
  label: ReactNode;
  icon?: ReactNode;
  /** Compteur ou pastille affichée après le libellé. */
  badge?: ReactNode;
  disabled?: boolean;
}

export interface TabsProps {
  items: TabItem[];
  /** Identifiant de l'onglet actif. */
  value: string;
  onChange: (id: string) => void;
  /** `aria-label` de la barre d'onglets. */
  label?: string;
  /** Préfixe des identifiants de panneaux (`aria-controls`). */
  panelIdPrefix?: string;
  size?: 'sm' | 'md';
  fullWidth?: boolean;
  className?: string;
  tabClassName?: string;
}

/**
 * Onglets soulignés façon YouTube.
 * Les panneaux sont rendus par la page : `id={`${panelIdPrefix}-${tabId}`}`,
 * `role="tabpanel"` et `aria-labelledby` pointant sur l'onglet.
 */
export function Tabs({
  items,
  value,
  onChange,
  label = 'Onglets',
  panelIdPrefix,
  size = 'md',
  fullWidth = false,
  className,
  tabClassName,
}: TabsProps) {
  const refs = useRef<(HTMLButtonElement | null)[]>([]);

  const onKeyDown = useCallback(
    (event: KeyboardEvent<HTMLDivElement>) => {
      const enabled = items
        .map((item, index) => (item.disabled ? -1 : index))
        .filter((index) => index >= 0);
      if (enabled.length === 0) return;

      const currentIndex = items.findIndex((item) => item.id === value);
      const position = Math.max(0, enabled.indexOf(currentIndex));

      let nextPosition: number | null = null;
      if (event.key === 'ArrowRight') nextPosition = (position + 1) % enabled.length;
      else if (event.key === 'ArrowLeft')
        nextPosition = (position - 1 + enabled.length) % enabled.length;
      else if (event.key === 'Home') nextPosition = 0;
      else if (event.key === 'End') nextPosition = enabled.length - 1;

      if (nextPosition === null) return;
      event.preventDefault();
      const target = enabled[nextPosition];
      refs.current[target]?.focus();
      onChange(items[target].id);
    },
    [items, onChange, value],
  );

  return (
    <div
      role="tablist"
      aria-label={label}
      onKeyDown={onKeyDown}
      className={cn(
        // `kt-no-scrollbar` masque la barre de défilement (elle mangerait une
        // ligne visible sous les onglets sur Android) ; `overscroll-x-contain`
        // évite qu'un balayage horizontal en fin de course déclenche le geste
        // « retour » du navigateur ; `scroll-smooth` respecte automatiquement
        // `prefers-reduced-motion` côté navigateur.
        'kt-no-scrollbar flex overflow-x-auto overscroll-x-contain scroll-smooth border-b border-border',
        fullWidth && 'w-full',
        className,
      )}
    >
      {items.map((item, index) => {
        const selected = item.id === value;
        return (
          <button
            key={item.id}
            ref={(el) => {
              refs.current[index] = el;
            }}
            type="button"
            role="tab"
            id={panelIdPrefix ? `${panelIdPrefix}-tab-${item.id}` : undefined}
            aria-selected={selected}
            aria-controls={panelIdPrefix ? `${panelIdPrefix}-${item.id}` : undefined}
            tabIndex={selected ? 0 : -1}
            disabled={item.disabled}
            onClick={() => onChange(item.id)}
            className={cn(
              'relative -mb-px inline-flex shrink-0 items-center justify-center gap-2 whitespace-nowrap',
              'border-b-2 font-medium transition-colors kt-tap-y kt-focus-ring',
              size === 'sm' ? 'px-3 py-2 text-kt-sm' : 'px-4 py-3 text-kt-base',
              selected
                ? 'border-fg text-fg'
                : 'border-transparent text-fg-muted hover:text-fg',
              item.disabled && 'cursor-not-allowed opacity-40',
              fullWidth && 'flex-1',
              tabClassName,
            )}
          >
            {item.icon}
            {item.label}
            {item.badge ? (
              <span className="text-kt-sm text-fg-subtle">{item.badge}</span>
            ) : null}
          </button>
        );
      })}
    </div>
  );
}
