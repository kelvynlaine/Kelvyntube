'use client';

import { useMemo } from 'react';
import { useRouter } from 'next/navigation';
import { useTheme } from 'next-themes';
import {
  User,
  SquarePlay,
  Repeat,
  Moon,
  Sun,
  Settings,
  LogOut,
  HelpCircle,
} from 'lucide-react';
import { Avatar, DropdownMenu, type DropdownMenuItem } from '@kelvyntube/ui';
import { useAuth } from '@/lib/auth-context';
import { PATHS } from '@/lib/nav';

/** Menu du compte, ouvert depuis l'avatar de la barre supérieure. */
export function UserMenu() {
  const router = useRouter();
  const { user, activeChannel, channelsOrEmpty, logout, setActiveChannel } = useUserMenuData();
  const { theme, setTheme } = useTheme();

  const items = useMemo<DropdownMenuItem[]>(() => {
    if (!user) return [];

    const channelItems: DropdownMenuItem[] =
      channelsOrEmpty.length > 1
        ? [
            { id: 'sep-channels', separator: true, label: '' },
            ...channelsOrEmpty.map((c) => ({
              id: `channel-${c.id}`,
              label: c.name,
              description: `@${c.handle}`,
              icon: <Repeat size={20} />,
              checked: c.id === activeChannel?.id,
              onSelect: () => void setActiveChannel(c.id),
            })),
          ]
        : [];

    return [
      {
        id: 'channel',
        label: activeChannel ? 'Votre chaîne' : 'Créer une chaîne',
        icon: <User size={20} />,
        onSelect: () =>
          router.push(activeChannel ? PATHS.channel(activeChannel.handle) : PATHS.onboarding),
      },
      {
        id: 'studio',
        label: 'Kelvyn Studio',
        icon: <SquarePlay size={20} />,
        onSelect: () =>
          router.push(activeChannel ? PATHS.studioChannel(activeChannel.id) : PATHS.studio),
      },
      ...channelItems,
      { id: 'sep-1', separator: true, label: '' },
      {
        id: 'theme',
        label: theme === 'dark' ? 'Apparence : Sombre' : 'Apparence : Clair',
        icon: theme === 'dark' ? <Moon size={20} /> : <Sun size={20} />,
        closeOnSelect: false,
        onSelect: () => setTheme(theme === 'dark' ? 'light' : 'dark'),
      },
      {
        id: 'settings',
        label: 'Paramètres',
        icon: <Settings size={20} />,
        onSelect: () => router.push(PATHS.settings),
      },
      {
        id: 'help',
        label: 'Aide',
        icon: <HelpCircle size={20} />,
        onSelect: () => router.push('/aide'),
      },
      { id: 'sep-2', separator: true, label: '' },
      {
        id: 'logout',
        label: 'Se déconnecter',
        icon: <LogOut size={20} />,
        danger: true,
        onSelect: () => void logout(),
      },
    ];
  }, [user, activeChannel, channelsOrEmpty, theme, setTheme, setActiveChannel, logout, router]);

  if (!user) return null;

  return (
    <DropdownMenu
      align="end"
      items={items}
      trigger={
        <button
          type="button"
          aria-label="Menu du compte"
          className="rounded-full kt-focus-ring"
        >
          <Avatar name={user.displayName} src={user.avatarUrl ?? undefined} size="sm" />
        </button>
      }
    />
  );
}

/** Petit adaptateur pour garder `UserMenu` lisible. */
function useUserMenuData() {
  const { user, activeChannel, logout, setActiveChannel } = useAuth();
  return {
    user,
    activeChannel,
    channelsOrEmpty: user?.channels ?? [],
    logout,
    setActiveChannel,
  };
}
