'use client';

import { useRouter } from 'next/navigation';
import { useState } from 'react';
import { Check, ChevronsUpDown } from 'lucide-react';
import { Avatar, DropdownMenu, Spinner, useToast } from '@kelvyntube/ui';
import { formatCompactNumber } from '@kelvyntube/shared';
import { useAuth } from '@/lib/auth-context';
import { PATHS } from '@/lib/nav';

/**
 * En-tête de la sidebar : identité de la chaîne courante et, quand
 * l'utilisateur en possède plusieurs, sélecteur de chaîne active.
 * Changer de chaîne bascule `setActiveChannel` puis navigue vers son Studio.
 */
export function ChannelSwitcher({
  channelId,
  collapsed = false,
}: {
  channelId: string;
  collapsed?: boolean;
}) {
  const { user, setActiveChannel } = useAuth();
  const { toast } = useToast();
  const router = useRouter();
  const [switching, setSwitching] = useState(false);

  const channels = user?.channels ?? [];
  const current = channels.find((channel) => channel.id === channelId) ?? channels[0] ?? null;

  if (!current) return null;

  const handleSwitch = async (nextId: string) => {
    if (nextId === current.id) return;
    setSwitching(true);
    try {
      await setActiveChannel(nextId);
      router.push(PATHS.studioChannel(nextId));
    } catch {
      toast({ message: 'Impossible de changer de chaîne.', variant: 'error' });
    } finally {
      setSwitching(false);
    }
  };

  // Une seule chaîne : pas de sélecteur, juste l'identité.
  if (channels.length < 2) {
    return (
      <div
        className={
          collapsed
            ? 'flex flex-col items-center gap-2 px-2 py-4'
            : 'flex flex-col items-center gap-2 px-4 py-6 text-center'
        }
      >
        <Avatar name={current.name} src={current.avatarUrl} size={collapsed ? 'md' : 'lg'} />
        {!collapsed ? (
          <>
            <p className="text-kt-sm text-fg-muted">Votre chaîne</p>
            <p className="w-full truncate text-kt-md font-medium text-fg">{current.name}</p>
            <p className="text-kt-sm text-fg-subtle">
              {formatCompactNumber(current.subscriberCount)} abonnés
            </p>
          </>
        ) : null}
      </div>
    );
  }

  return (
    <div className={collapsed ? 'px-2 py-4' : 'px-3 py-5'}>
      <DropdownMenu
        align="start"
        label="Choisir la chaîne active"
        items={channels.map((channel) => ({
          id: channel.id,
          label: channel.name,
          description: `${formatCompactNumber(channel.subscriberCount)} abonnés`,
          icon:
            channel.id === current.id ? (
              <Check size={16} aria-hidden="true" />
            ) : (
              <Avatar name={channel.name} src={channel.avatarUrl} size="xs" />
            ),
          checked: channel.id === current.id,
          onSelect: () => void handleSwitch(channel.id),
        }))}
        trigger={(triggerProps) => (
          <button
            {...triggerProps}
            type="button"
            disabled={switching}
            aria-label={`Chaîne active : ${current.name}. Changer de chaîne`}
            className={
              collapsed
                ? 'flex w-full flex-col items-center gap-1 rounded-kt p-2 transition-colors hover:bg-bg-hover kt-focus-ring'
                : 'flex w-full flex-col items-center gap-2 rounded-kt p-3 text-center transition-colors hover:bg-bg-hover kt-focus-ring'
            }
          >
            <Avatar name={current.name} src={current.avatarUrl} size={collapsed ? 'md' : 'lg'} />
            {!collapsed ? (
              <>
                <span className="text-kt-sm text-fg-muted">Votre chaîne</span>
                <span className="flex w-full min-w-0 items-center justify-center gap-1">
                  <span className="min-w-0 truncate text-kt-md font-medium text-fg">
                    {current.name}
                  </span>
                  {switching ? (
                    <Spinner size={14} />
                  ) : (
                    <ChevronsUpDown size={14} aria-hidden="true" className="shrink-0 text-fg-muted" />
                  )}
                </span>
                <span className="text-kt-sm text-fg-subtle">
                  {formatCompactNumber(current.subscriberCount)} abonnés
                </span>
              </>
            ) : null}
          </button>
        )}
      />
    </div>
  );
}
