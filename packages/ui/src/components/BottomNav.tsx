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
  /**
   * Libellé de repli affiché sous 360 px. Optionnel : sans lui, `label` est
   * utilisé partout (comportement historique inchangé).
   * Cinq colonnes sur un écran de 320 px laissent ~60 px par entrée :
   * « Abonnements » ou « Bibliothèque » y seraient tronqués en plein milieu
   * d'un mot. Un libellé court entier vaut mieux qu'un libellé long coupé.
   */
  shortLabel?: string;
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
    shortLabel: 'Abos',
    href: '/feed/subscriptions',
    icon: <ListVideo size={22} />,
  },
  {
    id: 'library',
    label: 'Bibliothèque',
    shortLabel: 'Biblio',
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
          // `min-w-0` : sans lui, un libellé long impose sa largeur à la
          // colonne `flex-1` et pousse la barre au-delà de l'écran.
          'flex min-w-0 flex-1 flex-col items-center justify-center gap-1 rounded-kt px-0.5 py-1.5 kt-tap-y kt-focus-ring',
          active ? 'text-fg' : 'text-fg-muted',
        )}
      >
        <span aria-hidden="true" className="shrink-0">
          {item.icon}
        </span>
        <span className="max-w-full truncate text-kt-xs leading-none">
          {item.shortLabel ? (
            <>
              {/* Deux variantes plutôt qu'une troncature : sous 360 px le
                  libellé court est affiché en entier, au-dessus le libellé
                  complet reprend sa place. */}
              <span className="xxs:hidden">{item.shortLabel}</span>
              <span className="hidden xxs:inline">{item.label}</span>
            </>
          ) : (
            item.label
          )}
        </span>
      </Link>
    );
  };

  return (
    <nav
      aria-label="Navigation mobile"
      className={cn(
        // `gap-0.5` sous 360 px : chaque pixel de gouttière est repris sur la
        // largeur des libellés. Le retrait bas de sécurité (indicateur
        // d'accueil iOS) est conservé tel quel.
        'fixed inset-x-0 bottom-0 z-40 flex items-stretch gap-0.5 border-t border-border bg-bg px-1 pb-[env(safe-area-inset-bottom)] xxs:gap-1 feed-3:hidden',
        className,
      )}
    >
      {left.map(renderItem)}

      {onCreate ? (
        <button
          type="button"
          aria-label={createLabel}
          onClick={onCreate}
          className="flex shrink-0 flex-col items-center justify-center gap-1 px-2 kt-tap kt-focus-ring"
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
