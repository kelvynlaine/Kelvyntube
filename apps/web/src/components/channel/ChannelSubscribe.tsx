'use client';

import { useMutation, useQueryClient } from '@tanstack/react-query';
import { useState } from 'react';
import {
  ROUTES,
  type ChannelDTO,
  type NotificationLevel,
} from '@kelvyntube/shared';
import { SubscribeButton } from '@kelvyntube/ui';
import { api } from '@/lib/api';
import { useAuth } from '@/lib/auth-context';
import { channelKeys, errorMessage } from './queries';

interface SubscribeResult {
  subscribed: boolean;
  level: NotificationLevel | null;
  subscriberCount: number;
}

export interface ChannelSubscribeProps {
  channel: ChannelDTO;
  size?: 'sm' | 'md';
  className?: string;
}

/**
 * `SubscribeButton` branché sur les routes d'abonnement.
 * Un visiteur anonyme déclenche `requireAuth()` (modale de connexion rapide).
 */
export function ChannelSubscribe({ channel, size = 'md', className }: ChannelSubscribeProps) {
  const { user, requireAuth } = useAuth();
  const queryClient = useQueryClient();
  const [error, setError] = useState<string | null>(null);

  /** Applique la réponse serveur au cache de la chaîne (aucune re-requête). */
  const applyResult = (result: SubscribeResult) => {
    queryClient.setQueryData<ChannelDTO>(channelKeys.byHandle(channel.handle), (current) =>
      current
        ? {
            ...current,
            subscriberCount: result.subscriberCount,
            viewer: {
              ...current.viewer,
              isSubscribed: result.subscribed,
              notificationLevel: result.level,
            },
          }
        : current,
    );
    // Le feed d'abonnements et la liste d'abonnements deviennent obsolètes.
    void queryClient.invalidateQueries({ queryKey: ['subscriptions'] });
  };

  const mutation = useMutation({
    mutationFn: async (action: { type: 'subscribe' | 'unsubscribe' | 'level'; level?: NotificationLevel }) => {
      if (action.type === 'unsubscribe') {
        return api.delete<SubscribeResult>(ROUTES.channels.unsubscribe(channel.id));
      }
      if (action.type === 'level') {
        return api.patch<SubscribeResult>(ROUTES.subscriptions.updateLevel(channel.id), {
          level: action.level,
        });
      }
      return api.post<SubscribeResult>(ROUTES.channels.subscribe(channel.id), {
        level: action.level ?? 'PERSONALIZED',
      });
    },
    onMutate: () => setError(null),
    onSuccess: applyResult,
    onError: (err) => setError(errorMessage(err)),
  });

  /** Le propriétaire ne peut pas s'abonner à sa propre chaîne. */
  if (channel.viewer.isOwner) return null;

  const guard = (run: () => void) => {
    if (!user) {
      requireAuth('subscribe');
      return;
    }
    run();
  };

  return (
    <div className={className}>
      <SubscribeButton
        subscribed={channel.viewer.isSubscribed}
        notificationLevel={channel.viewer.notificationLevel}
        loading={mutation.isPending}
        size={size}
        onSubscribe={() => guard(() => mutation.mutate({ type: 'subscribe' }))}
        onUnsubscribe={() => guard(() => mutation.mutate({ type: 'unsubscribe' }))}
        onLevelChange={(level) => guard(() => mutation.mutate({ type: 'level', level }))}
      />
      <p role="status" aria-live="polite" className="mt-1 text-kt-sm text-danger empty:hidden">
        {error}
      </p>
    </div>
  );
}
