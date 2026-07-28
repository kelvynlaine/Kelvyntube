'use client';

import { usePathname, useRouter } from 'next/navigation';
import { useEffect, useMemo, type ReactNode } from 'react';
import { Tabs, type TabItem } from '@kelvyntube/ui';
import { PATHS } from '@/lib/nav';

/** Identifiants d'onglets — `accueil` correspond à la racine `/@handle`. */
export type ChannelTabId =
  | 'accueil'
  | 'videos'
  | 'shorts'
  | 'playlists'
  | 'communaute'
  | 'a-propos';

const TABS: { id: ChannelTabId; label: string }[] = [
  { id: 'accueil', label: 'Accueil' },
  { id: 'videos', label: 'Vidéos' },
  { id: 'shorts', label: 'Shorts' },
  { id: 'playlists', label: 'Playlists' },
  { id: 'communaute', label: 'Communauté' },
  { id: 'a-propos', label: 'À propos' },
];

/** URL cible d'un onglet — toujours issue de `PATHS`. */
export function channelTabHref(handle: string, tab: ChannelTabId): string {
  return tab === 'accueil'
    ? PATHS.channel(handle)
    : PATHS.channelTab(handle, tab);
}

/** Onglet actif déduit du dernier segment du pathname. */
export function activeChannelTab(pathname: string): ChannelTabId {
  const last = pathname.split('/').filter(Boolean).pop() ?? '';
  const match = TABS.find((tab) => tab.id === last && tab.id !== 'accueil');
  return match?.id ?? 'accueil';
}

export interface ChannelTabsProps {
  handle: string;
}

/**
 * Barre d'onglets collante sous l'en-tête de chaîne.
 *
 * Le composant `Tabs` du design system rend des `<button role="tab">` : la
 * navigation passe donc par `router.push` vers l'URL calculée par `PATHS`,
 * et chaque cible est préchargée (`router.prefetch`) pour retrouver le confort
 * d'un `next/link`.
 */
export function ChannelTabs({ handle }: ChannelTabsProps) {
  const pathname = usePathname() ?? '';
  const router = useRouter();
  const active = activeChannelTab(pathname);

  const items = useMemo<TabItem[]>(
    () => TABS.map((tab) => ({ id: tab.id, label: tab.label })),
    [],
  );

  useEffect(() => {
    for (const tab of TABS) router.prefetch(channelTabHref(handle, tab.id));
  }, [handle, router]);

  // Pleine largeur sous la barre supérieure fixe (`h-topbar`) : les marges
  // négatives annulent la gouttière du conteneur `AppShell`.
  const stickyClass =
    'sticky top-topbar z-20 -mx-4 bg-bg px-4 feed-3:-mx-6 feed-3:px-6';

  return (
    <Tabs
      items={items}
      value={active}
      onChange={(id) => router.push(channelTabHref(handle, id as ChannelTabId))}
      label="Onglets de la chaîne"
      panelIdPrefix="channel"
      className={stickyClass}
    />
  );
}

/**
 * Panneau associé à un onglet — respecte le contrat d'accessibilité de `Tabs`
 * (`id={panelIdPrefix-tabId}` + `aria-labelledby` sur l'onglet correspondant).
 */
export function ChannelTabPanel({
  tab,
  children,
  className,
}: {
  tab: ChannelTabId;
  children: ReactNode;
  className?: string;
}) {
  return (
    <div
      role="tabpanel"
      id={`channel-${tab}`}
      aria-labelledby={`channel-tab-${tab}`}
      tabIndex={0}
      className={className ?? 'flex flex-col gap-8 outline-none'}
    >
      {children}
    </div>
  );
}
