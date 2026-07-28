'use client';

import { ArrowLeft, Bell, Menu, Mic, Search, Video } from 'lucide-react';
import {
  useEffect,
  useRef,
  useState,
  type FormEvent,
  type ReactNode,
} from 'react';
import { cn } from '../cn';
import { resolveLinkComponent, type LinkComponent } from '../types';
import { Avatar } from './Avatar';
import { Button } from './Button';
import { IconButton } from './IconButton';
import { KelvynLogo } from './Logo';

export interface TopBarUser {
  displayName: string;
  avatarUrl: string | null;
}

export interface TopBarProps {
  /** Bouton hamburger (bascule la sidebar). */
  onToggleSidebar?: () => void;
  homeHref?: string;
  linkComponent?: LinkComponent;

  /** Recherche — non contrôlée si `searchValue` est omis. */
  searchValue?: string;
  onSearchChange?: (value: string) => void;
  onSearchSubmit?: (value: string) => void;
  onVoiceSearch?: () => void;
  searchPlaceholder?: string;
  /** Panneau de suggestions rendu sous le champ (fourni par la page). */
  searchSuggestions?: ReactNode;

  onCreateClick?: () => void;
  onNotificationsClick?: () => void;
  /** Compteur affiché en pastille sur la cloche. */
  notificationCount?: number;
  onAvatarClick?: () => void;
  user?: TopBarUser | null;
  onSignIn?: () => void;

  /** Contenu additionnel inséré à droite (avant l'avatar). */
  rightSlot?: ReactNode;
  className?: string;
}

/** Barre supérieure : logo, recherche extensible, actions et compte. */
export function TopBar({
  onToggleSidebar,
  homeHref = '/',
  linkComponent,
  searchValue,
  onSearchChange,
  onSearchSubmit,
  onVoiceSearch,
  searchPlaceholder = 'Rechercher',
  searchSuggestions,
  onCreateClick,
  onNotificationsClick,
  notificationCount = 0,
  onAvatarClick,
  user,
  onSignIn,
  rightSlot,
  className,
}: TopBarProps) {
  const Link = resolveLinkComponent(linkComponent);
  const [internalValue, setInternalValue] = useState('');
  const [mobileSearchOpen, setMobileSearchOpen] = useState(false);
  const inputRef = useRef<HTMLInputElement | null>(null);

  const value = searchValue ?? internalValue;

  const setValue = (next: string) => {
    if (searchValue === undefined) setInternalValue(next);
    onSearchChange?.(next);
  };

  // Focus automatique à l'ouverture de la recherche mobile
  useEffect(() => {
    if (mobileSearchOpen) inputRef.current?.focus();
  }, [mobileSearchOpen]);

  const submit = (event: FormEvent) => {
    event.preventDefault();
    const trimmed = value.trim();
    if (trimmed) onSearchSubmit?.(trimmed);
  };

  const searchForm = (
    <form
      role="search"
      onSubmit={submit}
      className="relative flex w-full items-center gap-2"
    >
      <div className="flex min-w-0 flex-1 items-center rounded-pill border border-border bg-bg focus-within:border-accent-fg">
        <label htmlFor="kt-topbar-search" className="sr-only">
          Rechercher une vidéo ou une chaîne
        </label>
        <input
          ref={inputRef}
          id="kt-topbar-search"
          type="search"
          value={value}
          placeholder={searchPlaceholder}
          onChange={(event) => setValue(event.target.value)}
          className="h-10 min-w-0 flex-1 rounded-l-pill bg-transparent px-4 text-kt-md text-fg outline-none placeholder:text-fg-subtle"
        />
        <button
          type="submit"
          aria-label="Lancer la recherche"
          className="flex h-10 w-16 shrink-0 items-center justify-center rounded-r-pill border-l border-border bg-bg-elevated text-fg transition-colors hover:bg-bg-hover kt-focus-ring"
        >
          <Search size={20} aria-hidden="true" />
        </button>
      </div>

      {onVoiceSearch ? (
        <IconButton
          aria-label="Recherche vocale"
          tooltip="Recherche vocale"
          variant="solid"
          onClick={onVoiceSearch}
        >
          <Mic size={20} />
        </IconButton>
      ) : null}

      {searchSuggestions ? (
        <div className="absolute left-0 right-0 top-full z-50 mt-2">
          {searchSuggestions}
        </div>
      ) : null}
    </form>
  );

  // ── Mode recherche plein écran (mobile) ──────────────────────────────────
  if (mobileSearchOpen) {
    return (
      <header
        className={cn(
          'sticky top-0 z-40 flex h-topbar items-center gap-2 bg-bg px-2 feed-3:hidden',
          className,
        )}
      >
        <IconButton
          aria-label="Fermer la recherche"
          onClick={() => setMobileSearchOpen(false)}
        >
          <ArrowLeft size={22} />
        </IconButton>
        {searchForm}
      </header>
    );
  }

  return (
    <header
      className={cn(
        'sticky top-0 z-40 flex h-topbar items-center justify-between gap-2 bg-bg px-2 feed-2:px-4',
        className,
      )}
    >
      {/* Gauche : menu + logo */}
      <div className="flex shrink-0 items-center gap-1">
        {onToggleSidebar ? (
          <IconButton aria-label="Menu principal" onClick={onToggleSidebar}>
            <Menu size={22} />
          </IconButton>
        ) : null}
        <Link
          href={homeHref}
          aria-label="Accueil Kelvyn Tube"
          className="ml-1 rounded kt-focus-ring"
        >
          <KelvynLogo />
        </Link>
      </div>

      {/* Centre : recherche (masquée sur petits écrans) */}
      <div className="mx-4 hidden max-w-2xl flex-1 feed-3:flex">{searchForm}</div>

      {/* Droite : actions */}
      <div className="flex shrink-0 items-center gap-1">
        <IconButton
          aria-label="Rechercher"
          onClick={() => setMobileSearchOpen(true)}
          className="feed-3:hidden"
        >
          <Search size={22} />
        </IconButton>

        {rightSlot}

        {onCreateClick ? (
          <IconButton
            aria-label="Créer"
            tooltip="Créer"
            onClick={onCreateClick}
            className="hidden xs:inline-flex"
          >
            <Video size={22} />
          </IconButton>
        ) : null}

        {onNotificationsClick ? (
          <IconButton
            aria-label={
              notificationCount > 0
                ? `Notifications (${notificationCount} non lues)`
                : 'Notifications'
            }
            tooltip="Notifications"
            onClick={onNotificationsClick}
            className="relative"
          >
            <Bell size={22} />
            {notificationCount > 0 ? (
              <span
                aria-hidden="true"
                className="absolute right-1 top-1 min-w-4 rounded-pill bg-brand px-1 text-[10px] font-medium leading-4 text-white"
              >
                {notificationCount > 99 ? '99+' : notificationCount}
              </span>
            ) : null}
          </IconButton>
        ) : null}

        {user ? (
          <button
            type="button"
            aria-label={`Compte : ${user.displayName}`}
            onClick={onAvatarClick}
            className="ml-1 rounded-full kt-focus-ring"
          >
            <Avatar name={user.displayName} src={user.avatarUrl} size="sm" />
          </button>
        ) : onSignIn ? (
          <Button
            variant="outline"
            size="sm"
            onClick={onSignIn}
            className="ml-1 text-accent-fg"
          >
            Se connecter
          </Button>
        ) : null}
      </div>
    </header>
  );
}
