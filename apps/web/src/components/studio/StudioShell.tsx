'use client';

import Link from 'next/link';
import { usePathname, useRouter } from 'next/navigation';
import { useCallback, useEffect, useState, type ReactNode } from 'react';
import {
  ArrowLeft,
  BarChart3,
  ChevronLeft,
  ChevronRight,
  LayoutDashboard,
  LogOut,
  Menu,
  MessageSquare,
  Palette,
  Settings,
  Users,
  Video,
} from 'lucide-react';
import {
  Avatar,
  DropdownMenu,
  IconButton,
  KelvynLogo,
  Sheet,
  cn,
} from '@kelvyntube/ui';
import { useAuth } from '@/lib/auth-context';
import { PATHS } from '@/lib/nav';
import { ChannelSwitcher } from './ChannelSwitcher';

/**
 * ═══════════════════════════════════════════════════════════════════════════
 *  CHROME DU STUDIO
 *  Kelvyn Studio vit hors du shell principal : sidebar dédiée (rétractable,
 *  en `Sheet` sur mobile) et en-tête avec le bouton CRÉER.
 * ═══════════════════════════════════════════════════════════════════════════
 */

interface StudioNavEntry {
  key: string;
  label: string;
  icon: ReactNode;
  href: (channelId: string) => string;
  /** Correspondance exacte (tableau de bord) plutôt que par préfixe. */
  exact?: boolean;
}

const NAV_ENTRIES: StudioNavEntry[] = [
  {
    key: 'dashboard',
    label: 'Tableau de bord',
    icon: <LayoutDashboard size={20} aria-hidden="true" />,
    href: PATHS.studioChannel,
    exact: true,
  },
  {
    key: 'content',
    label: 'Contenu',
    icon: <Video size={20} aria-hidden="true" />,
    href: PATHS.studioVideos,
  },
  {
    key: 'analytics',
    label: 'Analytics',
    icon: <BarChart3 size={20} aria-hidden="true" />,
    href: PATHS.studioAnalytics,
  },
  {
    key: 'comments',
    label: 'Commentaires',
    icon: <MessageSquare size={20} aria-hidden="true" />,
    href: PATHS.studioComments,
  },
  {
    key: 'subscribers',
    label: 'Abonnés',
    icon: <Users size={20} aria-hidden="true" />,
    href: PATHS.studioSubscribers,
  },
  {
    key: 'customize',
    label: 'Personnalisation',
    icon: <Palette size={20} aria-hidden="true" />,
    href: PATHS.studioCustomize,
  },
];

const COLLAPSE_STORAGE_KEY = 'kt_studio_sidebar_collapsed';

/** Titre affiché dans l'en-tête, déduit du chemin courant. */
export function studioPageTitle(pathname: string, channelId: string): string {
  if (!channelId) return 'Kelvyn Studio';
  const base = PATHS.studioChannel(channelId);
  const rest = pathname.startsWith(base) ? pathname.slice(base.length) : '';

  if (rest === '' || rest === '/') return 'Tableau de bord de la chaîne';
  if (rest.startsWith('/videos/')) return 'Détails de la vidéo';
  if (rest.startsWith('/videos')) return 'Contenu de la chaîne';
  if (rest.startsWith('/analytics')) return 'Analytics de la chaîne';
  if (rest.startsWith('/commentaires')) return 'Commentaires';
  if (rest.startsWith('/abonnes')) return 'Abonnés';
  if (rest.startsWith('/personnalisation')) return 'Personnalisation de la chaîne';
  if (rest.startsWith('/upload')) return 'Mettre en ligne une vidéo';
  return 'Kelvyn Studio';
}

/** Liste de navigation, partagée par la sidebar fixe et le panneau mobile. */
function StudioNav({
  channelId,
  collapsed,
  onNavigate,
}: {
  channelId: string;
  collapsed: boolean;
  onNavigate?: () => void;
}) {
  const pathname = usePathname();

  return (
    <nav aria-label="Sections du Studio" className="flex flex-col gap-1 px-2">
      {NAV_ENTRIES.map((entry) => {
        const href = entry.href(channelId);
        const active = entry.exact ? pathname === href : pathname.startsWith(href);
        return (
          <Link
            key={entry.key}
            href={href}
            onClick={onNavigate}
            aria-current={active ? 'page' : undefined}
            title={collapsed ? entry.label : undefined}
            className={cn(
              'flex items-center rounded-kt px-3 py-2.5 text-kt-base text-fg transition-colors',
              'hover:bg-bg-hover kt-focus-ring',
              collapsed ? 'flex-col gap-1 px-1 py-3 text-kt-xs' : 'gap-4',
              active && 'bg-bg-hover font-medium',
            )}
          >
            <span className={cn('shrink-0', active && 'text-brand')}>{entry.icon}</span>
            <span className={cn(collapsed && 'w-full truncate text-center')}>{entry.label}</span>
          </Link>
        );
      })}
    </nav>
  );
}

/** Contenu complet de la sidebar (identité + navigation + retour). */
function SidebarContent({
  channelId,
  collapsed,
  onNavigate,
}: {
  channelId: string;
  collapsed: boolean;
  onNavigate?: () => void;
}) {
  return (
    <div className="flex h-full flex-col">
      <ChannelSwitcher channelId={channelId} collapsed={collapsed} />

      <div className="kt-scroll flex-1 overflow-y-auto pb-4">
        <StudioNav channelId={channelId} collapsed={collapsed} onNavigate={onNavigate} />
      </div>

      <div className="border-t border-border p-2">
        <Link
          href={PATHS.home}
          onClick={onNavigate}
          title={collapsed ? 'Retour à Kelvyn Tube' : undefined}
          className={cn(
            'flex items-center rounded-kt px-3 py-2.5 text-kt-base text-fg-muted transition-colors',
            'hover:bg-bg-hover hover:text-fg kt-focus-ring',
            collapsed ? 'flex-col gap-1 px-1 py-3 text-kt-xs' : 'gap-4',
          )}
        >
          <ArrowLeft size={20} aria-hidden="true" className="shrink-0" />
          <span className={cn(collapsed && 'w-full truncate text-center')}>Kelvyn Tube</span>
        </Link>
      </div>
    </div>
  );
}

/** Menu utilisateur de l'en-tête du Studio. */
function StudioUserMenu() {
  const { user, logout } = useAuth();
  const router = useRouter();
  if (!user) return null;

  return (
    <DropdownMenu
      align="end"
      label="Menu du compte"
      items={[
        {
          id: 'site',
          label: 'Retour à Kelvyn Tube',
          icon: <KelvynLogo size={16} withWordmark={false} title="" />,
          onSelect: () => router.push(PATHS.home),
        },
        {
          id: 'settings',
          label: 'Paramètres',
          icon: <Settings size={16} aria-hidden="true" />,
          onSelect: () => router.push(PATHS.settings),
        },
        { id: 'sep', separator: true },
        {
          id: 'logout',
          label: 'Se déconnecter',
          icon: <LogOut size={16} aria-hidden="true" />,
          onSelect: () => void logout(),
        },
      ]}
      trigger={(triggerProps) => (
        <button
          {...triggerProps}
          type="button"
          aria-label={`Compte de ${user.displayName}`}
          className="rounded-full kt-focus-ring"
        >
          <Avatar name={user.displayName} src={user.avatarUrl} size="sm" />
        </button>
      )}
    />
  );
}

export interface StudioShellProps {
  channelId: string;
  children: ReactNode;
}

export function StudioShell({ channelId, children }: StudioShellProps) {
  const pathname = usePathname();
  const [collapsed, setCollapsed] = useState(false);
  const [mobileOpen, setMobileOpen] = useState(false);

  // Préférence de repli persistée (lue après le montage : pas d'hydratation cassée).
  useEffect(() => {
    try {
      setCollapsed(localStorage.getItem(COLLAPSE_STORAGE_KEY) === '1');
    } catch {
      /* stockage indisponible : on garde la sidebar déployée */
    }
  }, []);

  const toggleCollapsed = useCallback(() => {
    setCollapsed((previous) => {
      const next = !previous;
      try {
        localStorage.setItem(COLLAPSE_STORAGE_KEY, next ? '1' : '0');
      } catch {
        /* ignoré */
      }
      return next;
    });
  }, []);

  const closeMobile = useCallback(() => setMobileOpen(false), []);
  const title = studioPageTitle(pathname, channelId);

  return (
    <div className="min-h-[100dvh] bg-bg">
      {/* ── Sidebar fixe (à partir de lg) ────────────────────────────────── */}
      <aside
        aria-label="Navigation du Studio"
        className={cn(
          'fixed inset-y-0 left-0 z-30 hidden border-r border-border bg-bg lg:block',
          'transition-[width] duration-200 ease-kt',
          collapsed ? 'w-sidebar-mini' : 'w-sidebar',
        )}
      >
        <SidebarContent channelId={channelId} collapsed={collapsed} />
      </aside>

      {/* ── Sidebar mobile ───────────────────────────────────────────────── */}
      <Sheet
        open={mobileOpen}
        onClose={closeMobile}
        side="left"
        ariaLabel="Navigation du Studio"
        sizeClassName="w-[min(280px,85vw)]"
      >
        <SidebarContent channelId={channelId} collapsed={false} onNavigate={closeMobile} />
      </Sheet>

      {/* ── Colonne principale ───────────────────────────────────────────── */}
      <div
        className={cn(
          'flex min-h-[100dvh] flex-col transition-[padding] duration-200 ease-kt',
          collapsed ? 'lg:pl-sidebar-mini' : 'lg:pl-sidebar',
        )}
      >
        <header className="sticky top-0 z-20 flex h-topbar shrink-0 items-center gap-3 border-b border-border bg-bg px-3 sm:px-4">
          <IconButton
            aria-label="Ouvrir la navigation du Studio"
            size="sm"
            className="lg:hidden"
            onClick={() => setMobileOpen(true)}
          >
            <Menu size={20} />
          </IconButton>

          <IconButton
            aria-label={collapsed ? 'Déployer la navigation' : 'Réduire la navigation'}
            tooltip={collapsed ? 'Déployer la navigation' : 'Réduire la navigation'}
            size="sm"
            className="hidden lg:inline-flex"
            onClick={toggleCollapsed}
          >
            {collapsed ? <ChevronRight size={20} /> : <ChevronLeft size={20} />}
          </IconButton>

          <h1 className="min-w-0 flex-1 truncate text-kt-md font-medium text-fg">{title}</h1>

          {/* Bouton CRÉER : c'est un lien, on le stylise comme un bouton `brand`. */}
          <Link
            href={PATHS.studioUpload(channelId)}
            className={cn(
              'inline-flex h-9 shrink-0 items-center gap-2 rounded-pill bg-brand px-4',
              'text-kt-base font-medium uppercase tracking-wide text-white',
              'transition-colors hover:bg-brand-hover kt-focus-ring',
            )}
          >
            <Video size={18} aria-hidden="true" />
            Créer
          </Link>

          <StudioUserMenu />
        </header>

        <main className="flex-1 px-3 py-4 sm:px-4 lg:px-6 lg:py-6">{children}</main>
      </div>
    </div>
  );
}
