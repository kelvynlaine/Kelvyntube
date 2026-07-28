'use client';

import {
  ROUTES,
  formatCompactNumber,
  type ChannelDTO,
  type ChannelSummaryDTO,
  type NotificationLevel,
} from '@kelvyntube/shared';
import { Avatar, SubscribeButton, VerifiedBadge } from '@kelvyntube/ui';
import { useMutation, useQuery, useQueryClient } from '@tanstack/react-query';
import Link from 'next/link';
import { useCallback } from 'react';
import { api } from '@/lib/api';
import { useAuth } from '@/lib/auth-context';
import { PATHS } from '@/lib/nav';

/**
 * Carte « chaîne » insérée dans la liste de résultats.
 * `ChannelSummaryDTO` ne porte ni description ni nombre de vidéos : la fiche
 * complète est chargée à la demande pour enrichir l'affichage.
 */
export interface ChannelResultCardProps {
  channel: ChannelSummaryDTO;
}

export function ChannelResultCard({ channel }: ChannelResultCardProps) {
  const { requireAuth } = useAuth();
  const queryClient = useQueryClient();
  const href = PATHS.channel(channel.handle);

  const { data: detail } = useQuery({
    queryKey: ['channel-detail', channel.id],
    queryFn: () =>
      api.get<ChannelDTO>(ROUTES.channels.byId(channel.id), { allowAnonymous: true }),
    staleTime: 60_000,
  });

  const subscribed = detail?.viewer.isSubscribed ?? false;
  const level = detail?.viewer.notificationLevel ?? null;

  const invalidate = useCallback(() => {
    void queryClient.invalidateQueries({ queryKey: ['channel-detail', channel.id] });
  }, [queryClient, channel.id]);

  const subscribe = useMutation({
    mutationFn: (nextLevel: NotificationLevel) =>
      api.post(ROUTES.channels.subscribe(channel.id), { level: nextLevel }),
    onSuccess: invalidate,
  });

  const unsubscribe = useMutation({
    mutationFn: () => api.delete(ROUTES.channels.unsubscribe(channel.id)),
    onSuccess: invalidate,
  });

  const changeLevel = useMutation({
    mutationFn: (nextLevel: NotificationLevel) =>
      api.patch(ROUTES.subscriptions.updateLevel(channel.id), { level: nextLevel }),
    onSuccess: invalidate,
  });

  const pending = subscribe.isPending || unsubscribe.isPending || changeLevel.isPending;
  const subscriberCount = detail?.subscriberCount ?? channel.subscriberCount;

  return (
    <article className="flex items-center gap-4 border-y border-border py-4 feed-3:gap-8 feed-3:px-8">
      <Link
        href={href}
        aria-label={channel.name}
        className="shrink-0 rounded-full kt-focus-ring"
      >
        <Avatar name={channel.name} src={detail?.avatarUrl ?? channel.avatarUrl} size="lg" />
      </Link>

      <div className="flex min-w-0 flex-1 flex-col gap-0.5">
        <Link
          href={href}
          className="flex min-w-0 items-center gap-1 rounded text-kt-md font-medium text-fg kt-focus-ring"
        >
          <span className="truncate">{detail?.name ?? channel.name}</span>
          {(detail?.verified ?? channel.verified) ? <VerifiedBadge size={14} /> : null}
        </Link>

        <p className="flex flex-wrap items-center gap-x-1 text-kt-sm text-fg-muted">
          <span className="truncate">@{channel.handle.replace(/^@/, '')}</span>
          <span aria-hidden="true">•</span>
          <span>{formatCompactNumber(subscriberCount)} abonnés</span>
          {typeof detail?.videoCount === 'number' ? (
            <>
              <span aria-hidden="true">•</span>
              <span>{formatCompactNumber(detail.videoCount)} vidéos</span>
            </>
          ) : null}
        </p>

        {detail?.description ? (
          <p className="kt-clamp-1 mt-1 text-kt-sm text-fg-muted">{detail.description}</p>
        ) : null}
      </div>

      <div className="shrink-0">
        <SubscribeButton
          subscribed={subscribed}
          notificationLevel={level}
          loading={pending}
          onSubscribe={() => {
            if (!requireAuth("s'abonner")) return;
            subscribe.mutate('PERSONALIZED');
          }}
          onUnsubscribe={() => unsubscribe.mutate()}
          onLevelChange={(nextLevel) => changeLevel.mutate(nextLevel)}
        />
      </div>
    </article>
  );
}
