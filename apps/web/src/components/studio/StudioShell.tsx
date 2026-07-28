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
  Rocket,
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
  {
    key: 'boost',
    label: 'Booster',
    icon: <Rocket size={20} aria-hidden="true" />,
    href: PATHS.studioBoost,
  },
];

const COLLAPSE_STORAGE_KEY = 'kt_studio_sidebar_collapsed';

/**
 * Titre de l'en-tête, déduit du chemin courant.
 *
 * Deux variantes : `long` pour le desktop, `short` pour le mobile. À 390 px,
 * « Tableau de bord de la chaîne » se faisait tronquer en « Tableau de bord... »,
 * ce qui donnait une ellipse permanente et illisible. On préfère un titre
 * court, complet et sans ellipse, plutôt qu'un titre long amputé.
 */
export function studioPageTitles(
  pathname: string,
  channelId: string,
): { long: string; short: string } {
  const fallback = { long: 'Kelvyn Studio', short: 'Studio' };
  if (!channelId) return fallback;
  const base = PATHS.studioChannel(channelId);
  const rest = pathname.startsWith(base) ? pathname.slice(base.length) : '';

  if (rest === '' || rest === '/')
    return { long: 'Tableau de bord de la chaîne', short: 'Tableau de bord' };
  if (rest.startsWith('/videos/')) return { long: 'Détails de la vidéo', short: 'Vidéo' };
  if (rest.startsWith('/videos')) return { long: 'Contenu de la chaîne', short: 'Contenu' };
  if (rest.startsWith('/analytics'))
    return { long: 'Analytics de la chaîne', short: 'Analytics' };
  if (rest.startsWith('/commentaires'))
    return { long: 'Commentaires', short: 'Commentaires' };
  if (rest.startsWith('/abonnes')) return { long: 'Abonnés', short: 'Abonnés' };
  if (rest.startsWith('/personnalisation'))
    return { long: 'Personnalisation de la chaîne', short: 'Personnalisation' };
  if (rest.startsWith('/booster'))
    return { long: 'Booster d’engagement', short: 'Booster' };
  if (rest.startsWith('/upload'))
    return { long: 'Mettre en ligne une vidéo', short: 'Mise en ligne' };
  return fallback;
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
              // `min-h-11` : 44 px de haut, cible tactile minimale au doigt
              // (le panneau mobile réutilise exactement cette liste).
              'flex min-h-11 items-center rounded-kt px-3 py-2.5 text-kt-base text-fg transition-colors',
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

      {/* Safe-area : sur iPhone, la barre d'accueil recouvre le bas du panneau. */}
      <div className="border-t border-border p-2 pb-[max(0.5rem,env(safe-area-inset-bottom))]">
        <Link
          href={PATHS.home}
          onClick={onNavigate}
          title={collapsed ? 'Retour à Kelvyn Tube' : undefined}
          className={cn(
            'flex min-h-11 items-center rounded-kt px-3 py-2.5 text-kt-base text-fg-muted transition-colors',
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
          // L'avatar ne fait que 32 px : on l'inscrit dans une cible de 44×44.
          className="inline-flex size-11 shrink-0 items-center justify-center rounded-full kt-focus-ring"
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
  const titles = studioPageTitles(pathname, channelId);

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
        <header className="sticky top-0 z-20 flex h-topbar shrink-0 items-center gap-2 border-b border-border bg-bg px-2 sm:gap-3 sm:px-4">
          <IconButton
            aria-label="Ouvrir la navigation du Studio"
            size="md"
            // 44×44 au doigt (l'IconButton `sm` du design system ne fait que 32 px).
            className="size-11 lg:hidden"
            onClick={() => setMobileOpen(true)}
          >
            <Menu size={22} />
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

          {/*
            Deux libellés plutôt qu'une troncature : le titre court tient
            entièrement sur 320 px, le titre long reprend la main dès `xs`.
          */}
          <h1 className="min-w-0 flex-1 truncate text-kt-md font-medium text-fg">
            <span className="xs:hidden">{titles.short}</span>
            <span className="hidden xs:inline">{titles.long}</span>
          </h1>

          {/*
            Bouton CRÉER : c'est un lien, on le stylise comme un bouton `brand`.
            Sous `xs`, le libellé disparaît au profit d'un bouton rond 44×44 :
            il reste atteignable sans dévorer la largeur réservée au titre.
          */}
          <Link
            href={PATHS.studioUpload(channelId)}
            aria-label="Mettre en ligne une vidéo"
            className={cn(
              'inline-flex size-11 shrink-0 items-center justify-center gap-2 rounded-pill bg-brand',
              'xs:h-11 xs:w-auto xs:px-4',
              'text-kt-base font-medium uppercase tracking-wide text-white',
              'transition-colors hover:bg-brand-hover kt-focus-ring',
            )}
          >
            <Video size={20} aria-hidden="true" />
            <span className="hidden xs:inline">Créer</span>
          </Link>

          <StudioUserMenu />
        </header>

        {/*
          `pb-[env(safe-area-inset-bottom)]` : le contenu du Studio défile
          jusqu'en bas de l'écran, il ne doit pas finir sous la barre d'accueil.
        */}
        <main className="flex-1 px-3 py-4 pb-[max(1rem,env(safe-area-inset-bottom))] sm:px-4 lg:px-6 lg:py-6">
          {children}
        </main>
      </div>
    </div>
  );
}
