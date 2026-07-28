'use client';

import { useCallback, useEffect, useState, type ReactNode } from 'react';
import Link from 'next/link';
import { usePathname, useRouter, useSearchParams } from 'next/navigation';
import { useQuery } from '@tanstack/react-query';
import { Bell } from 'lucide-react';
import {
  ROUTES,
  type SubscriptionDTO,
  type ChannelSummaryDTO,
} from '@kelvyntube/shared';
import { TopBar, Sidebar, BottomNav, IconButton, Sheet, useMediaQuery, cn } from '@kelvyntube/ui';
import { api } from '@/lib/api';
import { useAuth } from '@/lib/auth-context';
import { PATHS } from '@/lib/nav';
import {
  SIDEBAR_SECTIONS,
  RAIL_ITEMS,
  BOTTOM_NAV_ITEMS,
  FOOTER_LINKS,
} from './navigation';
import { UserMenu } from './UserMenu';
import { NotificationsMenu, useUnreadNotifications } from '@/components/notifications/NotificationsMenu';
import SearchSuggestions from '@/components/search/SearchSuggestions';
import AuthModal from '@/components/auth/AuthModal';

const SIDEBAR_STORAGE_KEY = 'kt_sidebar_collapsed';

/**
 * ═══════════════════════════════════════════════════════════════════════════
 *  SHELL APPLICATIF
 *  Assemble la barre supérieure, la sidebar, la navigation mobile et les
 *  surfaces globales (notifications, modale de connexion) autour des pages.
 * ═══════════════════════════════════════════════════════════════════════════
 */
export function AppShell({ children }: { children: ReactNode }) {
  const pathname = usePathname();
  const searchParams = useSearchParams();
  const router = useRouter();
  const { user, activeChannel, requireAuth } = useAuth();

  // ── Sidebar ─────────────────────────────────────────────────────────────
  // Desktop : repliable en rail de 72 px. Mobile / tablette : tiroir.
  const isDesktop = useMediaQuery('(min-width: 1313px)');
  const [collapsed, setCollapsed] = useState(false);
  const [drawerOpen, setDrawerOpen] = useState(false);

  useEffect(() => {
    try {
      setCollapsed(localStorage.getItem(SIDEBAR_STORAGE_KEY) === 'true');
    } catch {
      /* stockage indisponible — on garde la valeur par défaut */
    }
  }, []);

  const toggleSidebar = useCallback(() => {
    if (isDesktop) {
      setCollapsed((prev) => {
        const next = !prev;
        try {
          localStorage.setItem(SIDEBAR_STORAGE_KEY, String(next));
        } catch {
          /* ignoré */
        }
        return next;
      });
    } else {
      setDrawerOpen((prev) => !prev);
    }
  }, [isDesktop]);

  // Ferme le tiroir à chaque navigation
  useEffect(() => {
    setDrawerOpen(false);
  }, [pathname]);

  // ── Recherche ───────────────────────────────────────────────────────────
  const [searchValue, setSearchValue] = useState('');
  const [suggestionsOpen, setSuggestionsOpen] = useState(false);

  // Réhydrate le champ depuis l'URL sur la page de résultats
  useEffect(() => {
    if (pathname === '/resultats') setSearchValue(searchParams.get('q') ?? '');
  }, [pathname, searchParams]);

  const submitSearch = useCallback(
    (value: string) => {
      const q = value.trim();
      if (!q) return;
      setSuggestionsOpen(false);
      router.push(PATHS.results(q));
    },
    [router],
  );

  // ── Notifications ───────────────────────────────────────────────────────
  const [notificationsOpen, setNotificationsOpen] = useState(false);
  const unreadCount = useUnreadNotifications();

  // ── Abonnements affichés dans la sidebar ────────────────────────────────
  const { data: subscriptions } = useQuery({
    queryKey: ['subscriptions', 'sidebar'],
    queryFn: () => api.get<SubscriptionDTO[]>(ROUTES.subscriptions.list),
    enabled: Boolean(user),
    staleTime: 5 * 60_000,
  });

  const subscriptionChannels: ChannelSummaryDTO[] =
    subscriptions?.map((s) => s.channel) ?? [];

  // ── Création ────────────────────────────────────────────────────────────
  const handleCreate = useCallback(() => {
    if (!requireAuth('créer une vidéo')) return;
    router.push(
      activeChannel ? PATHS.studioUpload(activeChannel.id) : PATHS.onboarding,
    );
  }, [requireAuth, router, activeChannel]);

  const sidebarProps = {
    items: SIDEBAR_SECTIONS,
    activeHref: pathname,
    subscriptions: subscriptionChannels,
    footerLinks: FOOTER_LINKS,
    linkComponent: Link,
  };

  return (
    <div className="min-h-[100dvh] bg-bg">
      {/* ── Barre supérieure ───────────────────────────────────────────── */}
      <header className="fixed inset-x-0 top-0 z-40 h-topbar bg-bg">
        <TopBar
          onToggleSidebar={toggleSidebar}
          homeHref={PATHS.home}
          linkComponent={Link}
          searchValue={searchValue}
          onSearchChange={(v) => {
            setSearchValue(v);
            setSuggestionsOpen(true);
          }}
          onSearchSubmit={submitSearch}
          searchSuggestions={
            suggestionsOpen ? (
              <SearchSuggestions
                query={searchValue}
                onClose={() => setSuggestionsOpen(false)}
                onSelect={({ text, href }) => {
                  setSuggestionsOpen(false);
                  if (href) {
                    router.push(href);
                  } else {
                    setSearchValue(text);
                    submitSearch(text);
                  }
                }}
              />
            ) : null
          }
          onCreateClick={handleCreate}
          /*
           * `TopBar` sait afficher un avatar à partir de `user`, mais ce n'est
           * qu'un bouton : il ne peut pas ancrer le menu déroulant du compte.
           * On lui laisse donc uniquement le bouton « Se connecter » (visiteur
           * anonyme) et c'est `rightSlot` qui fournit l'avatar + son menu —
           * sinon les deux avatars s'affichent côte à côte.
           */
          user={null}
          onSignIn={user ? undefined : () => requireAuth()}
          rightSlot={
            user ? (
              <div className="relative flex items-center gap-1">
                <IconButton
                  aria-label={
                    unreadCount > 0
                      ? `Notifications (${unreadCount} non lues)`
                      : 'Notifications'
                  }
                  onClick={() => setNotificationsOpen((o) => !o)}
                >
                  <span className="relative">
                    <Bell size={22} />
                    {unreadCount > 0 && (
                      <span className="absolute -right-1.5 -top-1.5 flex h-4 min-w-4 items-center justify-center rounded-full bg-brand px-1 text-[10px] font-medium text-white">
                        {unreadCount > 99 ? '99+' : unreadCount}
                      </span>
                    )}
                  </span>
                </IconButton>
                <NotificationsMenu
                  open={notificationsOpen}
                  onClose={() => setNotificationsOpen(false)}
                />
                <UserMenu />
              </div>
            ) : null /* visiteur anonyme : la TopBar affiche déjà « Se connecter » */
          }
        />
      </header>

      {/* ── Sidebar fixe (desktop) ─────────────────────────────────────── */}
      {isDesktop && (
        <aside
          className={cn(
            'kt-scroll fixed left-0 top-topbar z-30 hidden h-[calc(100dvh-56px)] overflow-y-auto pb-4 feed-4:block',
            collapsed ? 'w-sidebar-mini' : 'w-sidebar',
          )}
        >
          <Sidebar
            {...sidebarProps}
            collapsed={collapsed}
            railItems={RAIL_ITEMS}
            showFooter={!collapsed}
          />
        </aside>
      )}

      {/* ── Tiroir de sidebar (mobile / tablette) ──────────────────────── */}
      <Sheet
        open={drawerOpen && !isDesktop}
        onClose={() => setDrawerOpen(false)}
        side="left"
        title="Menu"
        /*
         * 240 px sur tablette, mais jamais plus de 85 % de l'écran : à 320 px
         * l'overlay reste visible et tapable pour refermer le tiroir.
         */
        sizeClassName="w-[min(theme(spacing.sidebar),85vw)]"
      >
        <Sidebar {...sidebarProps} onNavigate={() => setDrawerOpen(false)} showFooter />
      </Sheet>

      {/* ── Contenu ────────────────────────────────────────────────────── */}
      <main
        className={cn(
          'pt-topbar transition-[padding] duration-200 ease-kt',
          /*
           * La `BottomNav` est `fixed` : sans cette réserve, la dernière carte
           * du feed passe dessous et devient intapable. On y ajoute la
           * safe-area iOS (barre d'accueil) que la nav absorbe elle aussi.
           */
          'pb-[calc(theme(spacing.bottomnav)+env(safe-area-inset-bottom))] feed-3:pb-0',
          isDesktop && (collapsed ? 'feed-4:pl-sidebar-mini' : 'feed-4:pl-sidebar'),
        )}
      >
        {/*
         * Le `<main>` compense déjà la `TopBar` fixe (`pt-topbar` = 56 px).
         * Sur mobile on réduit donc fortement la gouttière verticale interne :
         * additionnée, elle repoussait le contenu à 80 px du haut et écrasait
         * la zone utile. Les chips restent collées sous l'en-tête (YouTube).
         * Le padding confortable est rétabli à partir de `feed-3` (900 px).
         */}
        <div className="mx-auto w-full max-w-feed px-4 pb-4 pt-2 feed-3:px-6 feed-3:py-6">
          {children}
        </div>
      </main>

      {/* ── Navigation mobile (déjà `fixed` + safe-area côté design system) ─ */}
      <BottomNav
        items={BOTTOM_NAV_ITEMS}
        activeHref={pathname}
        onCreate={handleCreate}
        linkComponent={Link}
      />

      {/* ── Surfaces globales ──────────────────────────────────────────── */}
      <AuthModal />
    </div>
  );
}
