'use client';

import type { NotificationLevel } from '@kelvyntube/shared';
import { Bell, BellOff, BellRing, ChevronDown, UserMinus } from 'lucide-react';
import { cn } from '../cn';
import { Button } from './Button';
import { DropdownMenu, type DropdownMenuItem } from './DropdownMenu';

export interface SubscribeButtonProps {
  subscribed: boolean;
  notificationLevel?: NotificationLevel | null;
  onSubscribe: () => void;
  onUnsubscribe: () => void;
  onLevelChange: (level: NotificationLevel) => void;
  loading?: boolean;
  size?: 'sm' | 'md';
  className?: string;
  /** Masque le libellé « Abonné » (icône seule, pour les petites largeurs). */
  compact?: boolean;
}

const LEVEL_ICON: Record<NotificationLevel, typeof Bell> = {
  ALL: BellRing,
  PERSONALIZED: Bell,
  NONE: BellOff,
};

const LEVEL_LABEL: Record<NotificationLevel, string> = {
  ALL: 'Toutes',
  PERSONALIZED: 'Personnalisées',
  NONE: 'Aucune',
};

/**
 * Bouton d'abonnement — présentation pure.
 * Non abonné : bouton clair plein. Abonné : bouton gris + menu de notifications.
 */
export function SubscribeButton({
  subscribed,
  notificationLevel,
  onSubscribe,
  onUnsubscribe,
  onLevelChange,
  loading = false,
  size = 'md',
  className,
  compact = false,
}: SubscribeButtonProps) {
  if (!subscribed) {
    return (
      <Button
        variant="primary"
        size={size}
        loading={loading}
        onClick={onSubscribe}
        className={className}
      >
        S'abonner
      </Button>
    );
  }

  const level: NotificationLevel = notificationLevel ?? 'PERSONALIZED';
  const LevelIcon = LEVEL_ICON[level];

  const items: DropdownMenuItem[] = [
    {
      id: 'ALL',
      label: 'Toutes',
      description: 'Notifier chaque nouvelle vidéo',
      checked: level === 'ALL',
      onSelect: () => onLevelChange('ALL'),
    },
    {
      id: 'PERSONALIZED',
      label: 'Personnalisées',
      description: 'Selon vos habitudes de visionnage',
      checked: level === 'PERSONALIZED',
      onSelect: () => onLevelChange('PERSONALIZED'),
    },
    {
      id: 'NONE',
      label: 'Aucune',
      checked: level === 'NONE',
      onSelect: () => onLevelChange('NONE'),
    },
    { id: 'sep', separator: true },
    {
      id: 'unsubscribe',
      label: 'Se désabonner',
      icon: <UserMinus size={18} />,
      danger: true,
      onSelect: onUnsubscribe,
    },
  ];

  return (
    <DropdownMenu
      items={items}
      align="start"
      label="Notifications de la chaîne"
      className={className}
      trigger={(triggerProps) => (
        <Button
          {...triggerProps}
          variant="secondary"
          size={size}
          loading={loading}
          iconLeft={<LevelIcon size={18} aria-hidden="true" />}
          iconRight={<ChevronDown size={16} aria-hidden="true" />}
          aria-label={`Abonné — notifications : ${LEVEL_LABEL[level]}`}
        >
          <span className={cn(compact && 'sr-only')}>Abonné</span>
        </Button>
      )}
    />
  );
}
