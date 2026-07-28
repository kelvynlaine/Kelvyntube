'use client';

import type { ChannelSummaryDTO } from '@kelvyntube/shared';
import {
  ChevronDown,
  Clapperboard,
  Clock,
  Film,
  Flag,
  Flame,
  Gamepad2,
  GraduationCap,
  HelpCircle,
  History,
  Home,
  ListVideo,
  Music2,
  Newspaper,
  Settings,
  ThumbsUp,
  Trophy,
  User,
  Video,
} from 'lucide-react';
import { useState, type ReactNode } from 'react';
import { cn } from '../cn';
import { resolveLinkComponent, type LinkComponent } from '../types';
import { Avatar } from './Avatar';

export interface SidebarItem {
  id?: string;
  label: string;
  href: string;
  icon: ReactNode;
  /** Pastille de droite (compteur de nouveautés…). */
  badge?: ReactNode;
}

export interface SidebarSection {
  id: string;
  /** Titre de section (absent pour la section principale). */
  title?: string;
  items: SidebarItem[];
  /** Lien « Tout afficher » en fin de section. */
  moreLabel?: string;
  moreHref?: string;
}

export interface SidebarProps {
  /** Sections affichées ; `DEFAULT_SIDEBAR_SECTIONS` par défaut. */
  items?: SidebarSection[];
  /** URL courante — met l'entrée correspondante en surbrillance. */
  activeHref?: string;
  /** Rail réduit de 72 px. */
  collapsed?: boolean;
  /** Entrées du rail réduit. */
  railItems?: SidebarItem[];
  /** Chaînes suivies, insérées dans la section « Abonnements ». */
  subscriptions?: ChannelSummaryDTO[];
  /** Nombre d'abonnements visibles avant « Afficher plus ». */
  maxSubscriptions?: number;
  onNavigate?: (href: string) => void;
  linkComponent?: LinkComponent;
  footerLinks?: { label: string; href: string }[];
  showFooter?: boolean;
  className?: string;
}

/** Sections standard de la navigation latérale. */
export const DEFAULT_SIDEBAR_SECTIONS: SidebarSection[] = [
  {
    id: 'main',
    items: [
      { id: 'home', label: 'Accueil', href: '/', icon: <Home size={24} /> },
      {
        id: 'shorts',
        label: 'Shorts',
        href: '/shorts',
        icon: <Clapperboard size={24} />,
      },
      {
        id: 'subscriptions',
        label: 'Abonnements',
        href: '/feed/subscriptions',
        icon: <ListVideo size={24} />,
      },
    ],
  },
  {
    id: 'you',
    title: 'Vous',
    moreLabel: 'Vous',
    moreHref: '/feed/you',
    items: [
      {
        id: 'history',
        label: 'Historique',
        href: '/feed/history',
        icon: <History size={24} />,
      },
      {
        id: 'playlists',
        label: 'Playlists',
        href: '/feed/playlists',
        icon: <ListVideo size={24} />,
      },
      {
        id: 'your-videos',
        label: 'Vos vidéos',
        href: '/studio/videos',
        icon: <Video size={24} />,
      },
      {
        id: 'watch-later',
        label: 'À regarder plus tard',
        href: '/playlist?list=WL',
        icon: <Clock size={24} />,
      },
      {
        id: 'liked',
        label: 'Vidéos likées',
        href: '/playlist?list=LL',
        icon: <ThumbsUp size={24} />,
      },
    ],
  },
  {
    id: 'explore',
    title: 'Explorer',
    items: [
      {
        id: 'trending',
        label: 'Tendances',
        href: '/feed/trending',
        icon: <Flame size={24} />,
      },
      {
        id: 'music',
        label: 'Musique',
        href: '/feed/musique',
        icon: <Music2 size={24} />,
      },
      {
        id: 'gaming',
        label: 'Gaming',
        href: '/feed/gaming',
        icon: <Gamepad2 size={24} />,
      },
      {
        id: 'news',
        label: 'Actualités',
        href: '/feed/actualites',
        icon: <Newspaper size={24} />,
      },
      {
        id: 'sport',
        label: 'Sport',
        href: '/feed/sport',
        icon: <Trophy size={24} />,
      },
      {
        id: 'cinema',
        label: 'Cinéma',
        href: '/feed/cinema',
        icon: <Film size={24} />,
      },
      {
        id: 'education',
        label: 'Éducation',
        href: '/feed/education',
        icon: <GraduationCap size={24} />,
      },
    ],
  },
  {
    id: 'settings',
    title: 'Plus',
    items: [
      {
        id: 'settings',
        label: 'Paramètres',
        href: '/settings',
        icon: <Settings size={24} />,
      },
      {
        id: 'report',
        label: 'Signaler un contenu',
        href: '/report',
        icon: <Flag size={24} />,
      },
      {
        id: 'help',
        label: 'Aide',
        href: '/help',
        icon: <HelpCircle size={24} />,
      },
    ],
  },
];

/** Entrées du rail réduit (72 px). */
export const DEFAULT_RAIL_ITEMS: SidebarItem[] = [
  { id: 'home', label: 'Accueil', href: '/', icon: <Home size={24} /> },
  {
    id: 'shorts',
    label: 'Shorts',
    href: '/shorts',
    icon: <Clapperboard size={24} />,
  },
  {
    id: 'subscriptions',
    label: 'Abonnements',
    href: '/feed/subscriptions',
    icon: <ListVideo size={24} />,
  },
  { id: 'you', label: 'Vous', href: '/feed/you', icon: <User size={24} /> },
];

/** Liens légaux du pied de la sidebar. */
export const DEFAULT_SIDEBAR_FOOTER_LINKS = [
  { label: 'À propos', href: '/about' },
  { label: 'Presse', href: '/press' },
  { label: 'Contact', href: '/contact' },
  { label: 'Créateurs', href: '/creators' },
  { label: 'Publicité', href: '/ads' },
  { label: 'Conditions', href: '/terms' },
  { label: 'Confidentialité', href: '/privacy' },
  { label: 'Règlement', href: '/policies' },
];

/** Navigation latérale — présentation pure. */
export function Sidebar({
  items = DEFAULT_SIDEBAR_SECTIONS,
  activeHref,
  collapsed = false,
  railItems = DEFAULT_RAIL_ITEMS,
  subscriptions,
  maxSubscriptions = 7,
  onNavigate,
  linkComponent,
  footerLinks = DEFAULT_SIDEBAR_FOOTER_LINKS,
  showFooter = true,
  className,
}: SidebarProps) {
  const Link = resolveLinkComponent(linkComponent);
  const [showAllSubs, setShowAllSubs] = useState(false);

  const renderItem = (item: SidebarItem) => {
    const active = activeHref === item.href;
    return (
      <li key={item.id ?? item.href}>
        <Link
          href={item.href}
          aria-current={active ? 'page' : undefined}
          onClick={() => onNavigate?.(item.href)}
          className={cn('kt-sidebar-item', active && 'kt-sidebar-item-active')}
        >
          <span aria-hidden="true" className="shrink-0">
            {item.icon}
          </span>
          <span className="min-w-0 flex-1 truncate">{item.label}</span>
          {item.badge ? (
            <span className="shrink-0 text-kt-sm text-fg-muted">{item.badge}</span>
          ) : null}
        </Link>
      </li>
    );
  };

  // ── Rail réduit ──────────────────────────────────────────────────────────
  if (collapsed) {
    return (
      <nav
        aria-label="Navigation principale"
        className={cn(
          'kt-scroll flex w-sidebar-mini shrink-0 flex-col overflow-y-auto bg-bg py-1',
          className,
        )}
      >
        <ul className="flex flex-col">
          {railItems.map((item) => {
            const active = activeHref === item.href;
            return (
              <li key={item.id ?? item.href}>
                <Link
                  href={item.href}
                  aria-current={active ? 'page' : undefined}
                  onClick={() => onNavigate?.(item.href)}
                  className={cn(
                    'flex flex-col items-center gap-1 rounded-kt px-1 py-4 text-fg transition-colors hover:bg-bg-hover kt-focus-ring',
                    active && 'bg-bg-hover',
                  )}
                >
                  <span aria-hidden="true">{item.icon}</span>
                  <span className="text-kt-xs leading-none">{item.label}</span>
                </Link>
              </li>
            );
          })}
        </ul>
      </nav>
    );
  }

  const visibleSubs = showAllSubs
    ? subscriptions
    : subscriptions?.slice(0, maxSubscriptions);

  return (
    <nav
      aria-label="Navigation principale"
      className={cn(
        'kt-scroll flex w-sidebar shrink-0 flex-col gap-3 overflow-y-auto bg-bg px-3 py-3',
        className,
      )}
    >
      {items.map((section, index) => (
        <div key={section.id} className="flex flex-col">
          {index > 0 ? (
            <hr className="my-3 border-0 border-t border-border" aria-hidden="true" />
          ) : null}

          {section.title ? (
            <h2 className="px-3 py-1 text-kt-md font-medium text-fg">
              {section.moreHref ? (
                <Link
                  href={section.moreHref}
                  onClick={() => onNavigate?.(section.moreHref as string)}
                  className="inline-flex items-center gap-1 rounded kt-focus-ring hover:text-fg-muted"
                >
                  {section.title}
                  <ChevronDown size={18} className="-rotate-90" aria-hidden="true" />
                </Link>
              ) : (
                section.title
              )}
            </h2>
          ) : null}

          <ul className="flex flex-col">{section.items.map(renderItem)}</ul>
        </div>
      ))}

      {/* Abonnements */}
      {subscriptions && subscriptions.length > 0 ? (
        <div className="flex flex-col">
          <hr className="my-3 border-0 border-t border-border" aria-hidden="true" />
          <h2 className="px-3 py-1 text-kt-md font-medium text-fg">Abonnements</h2>
          <ul className="flex flex-col">
            {visibleSubs?.map((channel) => {
              const href = channel.handle.startsWith('@')
                ? `/${channel.handle}`
                : `/@${channel.handle}`;
              const active = activeHref === href;
              return (
                <li key={channel.id}>
                  <Link
                    href={href}
                    aria-current={active ? 'page' : undefined}
                    onClick={() => onNavigate?.(href)}
                    className={cn(
                      'kt-sidebar-item',
                      active && 'kt-sidebar-item-active',
                    )}
                  >
                    <Avatar
                      name={channel.name}
                      src={channel.avatarUrl}
                      size="xs"
                      className="shrink-0"
                    />
                    <span className="min-w-0 flex-1 truncate">{channel.name}</span>
                  </Link>
                </li>
              );
            })}
          </ul>

          {subscriptions.length > maxSubscriptions ? (
            <button
              type="button"
              aria-expanded={showAllSubs}
              onClick={() => setShowAllSubs((current) => !current)}
              className="kt-sidebar-item w-full text-left"
            >
              <ChevronDown
                size={24}
                aria-hidden="true"
                className={cn('shrink-0 transition-transform', showAllSubs && 'rotate-180')}
              />
              <span>{showAllSubs ? 'Afficher moins' : 'Afficher plus'}</span>
            </button>
          ) : null}
        </div>
      ) : null}

      {/* Pied de page légal */}
      {showFooter && footerLinks.length > 0 ? (
        <>
          <hr className="my-3 border-0 border-t border-border" aria-hidden="true" />
          <div className="flex flex-wrap gap-x-2 gap-y-1 px-3 pb-6 text-kt-xs font-medium text-fg-subtle">
            {footerLinks.map((link) => (
              <Link
                key={link.href}
                href={link.href}
                onClick={() => onNavigate?.(link.href)}
                className="rounded kt-focus-ring hover:text-fg-muted"
              >
                {link.label}
              </Link>
            ))}
            <p className="mt-3 w-full text-fg-subtle">© 2026 Kelvyn Tube</p>
          </div>
        </>
      ) : null}
    </nav>
  );
}
