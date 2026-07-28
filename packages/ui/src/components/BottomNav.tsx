'use client';

import { Clapperboard, Home, Library, ListVideo, Plus } from 'lucide-react';
import type { ReactNode } from 'react';
import { cn } from '../cn';
import { resolveLinkComponent, type LinkComponent } from '../types';

export interface BottomNavItem {
  id: string;
  label: string;
  href: string;
  icon: ReactNode;
}

export interface BottomNavProps {
  /** Entrées de gauche et de droite (le bouton central est géré à part). */
  items?: BottomNavItem[];
  activeHref?: string;
  onNavigate?: (href: string) => void;
  /** Bouton central « Créer ». */
  onCreate?: () => void;
  createLabel?: string;
  linkComponent?: LinkComponent;
  className?: string;
}

/** Entrées standard : deux à gauche, deux à droite du bouton central. */
export const DEFAULT_BOTTOM_NAV_ITEMS: BottomNavItem[] = [
  { id: 'home', label: 'Accueil', href: '/', icon: <Home size={22} /> },
  {
    id: 'shorts',
    label: 'Shorts',
    href: '/shorts',
    icon: <Clapperboard size={22} />,
  },
  {
    id: 'subscriptions',
    label: 'Abonnements',
    href: '/feed/subscriptions',
    icon: <ListVideo size={22} />,
  },
  {
    id: 'library',
    label: 'Bibliothèque',
    href: '/feed/you',
    icon: <Library size={22} />,
  },
];

/** Barre de navigation mobile fixe avec bouton « Créer » central proéminent. */
export function BottomNav({
  items = DEFAULT_BOTTOM_NAV_ITEMS,
  activeHref,
  onNavigate,
  onCreate,
  createLabel = 'Créer',
  linkComponent,
  className,
}: BottomNavProps) {
  const Link = resolveLinkComponent(linkComponent);
  const half = Math.ceil(items.length / 2);
  const left = items.slice(0, half);
  const right = items.slice(half);

  const renderItem = (item: BottomNavItem) => {
    const active = activeHref === item.href;
    return (
      <Link
        key={item.id}
        href={item.href}
        aria-current={active ? 'page' : undefined}
        onClick={() => onNavigate?.(item.href)}
        className={cn(
          'flex flex-1 flex-col items-center justify-center gap-1 rounded-kt py-1.5 kt-focus-ring',
          active ? 'text-fg' : 'text-fg-muted',
        )}
      >
        <span aria-hidden="true">{item.icon}</span>
        <span className="text-kt-xs leading-none">{item.label}</span>
      </Link>
    );
  };

  return (
    <nav
      aria-label="Navigation mobile"
      className={cn(
        'fixed inset-x-0 bottom-0 z-40 flex items-center gap-1 border-t border-border bg-bg px-1 pb-[env(safe-area-inset-bottom)] feed-3:hidden',
        className,
      )}
    >
      {left.map(renderItem)}

      {onCreate ? (
        <button
          type="button"
          aria-label={createLabel}
          onClick={onCreate}
          className="flex flex-col items-center justify-center gap-1 px-2 kt-focus-ring"
        >
          <span className="flex size-9 items-center justify-center rounded-full bg-fg text-fg-inverse">
            <Plus size={22} aria-hidden="true" />
          </span>
          <span className="sr-only">{createLabel}</span>
        </button>
      ) : null}

      {right.map(renderItem)}
    </nav>
  );
}
