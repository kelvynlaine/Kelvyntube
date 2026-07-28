import {
  Home,
  Clapperboard,
  ListVideo,
  History,
  Clock,
  ThumbsUp,
  PlaySquare,
  Library,
  Flame,
  Compass,
  Music,
  Gamepad2,
  Newspaper,
  Trophy,
  GraduationCap,
  Settings,
  HelpCircle,
  Flag,
} from 'lucide-react';
import type { SidebarSection, SidebarItem, BottomNavItem } from '@kelvyntube/ui';
import { PATHS } from '@/lib/nav';

/**
 * Définition des entrées de navigation de l'application.
 * Les libellés et les URLs vivent ici ; le design system ne fait que les rendre.
 */

export const SIDEBAR_SECTIONS: SidebarSection[] = [
  {
    id: 'principal',
    items: [
      { id: 'home', label: 'Accueil', href: PATHS.home, icon: <Home size={24} /> },
      { id: 'shorts', label: 'Shorts', href: PATHS.shorts, icon: <Clapperboard size={24} /> },
      {
        id: 'subs',
        label: 'Abonnements',
        href: PATHS.subscriptions,
        icon: <ListVideo size={24} />,
      },
    ],
  },
  {
    id: 'vous',
    title: 'Vous',
    items: [
      { id: 'library', label: 'Bibliothèque', href: PATHS.library, icon: <Library size={24} /> },
      { id: 'history', label: 'Historique', href: PATHS.history, icon: <History size={24} /> },
      {
        id: 'my-videos',
        label: 'Vos vidéos',
        href: PATHS.myVideos,
        icon: <PlaySquare size={24} />,
      },
      {
        id: 'watch-later',
        label: 'À regarder plus tard',
        href: PATHS.watchLater,
        icon: <Clock size={24} />,
      },
      { id: 'liked', label: 'Vidéos likées', href: PATHS.liked, icon: <ThumbsUp size={24} /> },
      { id: 'playlists', label: 'Playlists', href: PATHS.playlists, icon: <ListVideo size={24} /> },
    ],
  },
  {
    id: 'explorer',
    title: 'Explorer',
    items: [
      { id: 'trending', label: 'Tendances', href: PATHS.trending, icon: <Flame size={24} /> },
      { id: 'explore', label: 'Explorer', href: PATHS.explore, icon: <Compass size={24} /> },
      {
        id: 'music',
        label: 'Musique',
        href: PATHS.category('musique'),
        icon: <Music size={24} />,
      },
      {
        id: 'gaming',
        label: 'Gaming',
        href: PATHS.category('gaming'),
        icon: <Gamepad2 size={24} />,
      },
      {
        id: 'sport',
        label: 'Sport',
        href: PATHS.category('sport'),
        icon: <Trophy size={24} />,
      },
      {
        id: 'news',
        label: 'Actualités',
        href: PATHS.category('actualites'),
        icon: <Newspaper size={24} />,
      },
      {
        id: 'education',
        label: 'Éducation',
        href: PATHS.category('education'),
        icon: <GraduationCap size={24} />,
      },
    ],
  },
  {
    id: 'plus',
    title: 'Plus de Kelvyn Tube',
    items: [
      { id: 'settings', label: 'Paramètres', href: PATHS.settings, icon: <Settings size={24} /> },
      { id: 'help', label: 'Aide', href: '/aide', icon: <HelpCircle size={24} /> },
      { id: 'feedback', label: 'Envoyer un commentaire', href: '/feedback', icon: <Flag size={24} /> },
    ],
  },
];

/** Rail réduit (72 px) affiché quand la sidebar est repliée. */
export const RAIL_ITEMS: SidebarItem[] = [
  { id: 'home', label: 'Accueil', href: PATHS.home, icon: <Home size={24} /> },
  { id: 'shorts', label: 'Shorts', href: PATHS.shorts, icon: <Clapperboard size={24} /> },
  { id: 'subs', label: 'Abonnements', href: PATHS.subscriptions, icon: <ListVideo size={24} /> },
  { id: 'library', label: 'Vous', href: PATHS.library, icon: <Library size={24} /> },
];

export const BOTTOM_NAV_ITEMS: BottomNavItem[] = [
  { id: 'home', label: 'Accueil', href: PATHS.home, icon: <Home size={22} /> },
  { id: 'shorts', label: 'Shorts', href: PATHS.shorts, icon: <Clapperboard size={22} /> },
  { id: 'subs', label: 'Abonnements', href: PATHS.subscriptions, icon: <ListVideo size={22} /> },
  { id: 'library', label: 'Bibliothèque', href: PATHS.library, icon: <Library size={22} /> },
];

export const FOOTER_LINKS = [
  { label: 'À propos', href: '/a-propos' },
  { label: 'Presse', href: '/presse' },
  { label: 'Confidentialité', href: '/confidentialite' },
  { label: 'Conditions', href: '/conditions' },
];
