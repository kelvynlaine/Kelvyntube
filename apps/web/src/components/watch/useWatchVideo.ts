'use client';

import { useCallback, useMemo } from 'react';
import { useQuery, useQueryClient } from '@tanstack/react-query';
import {
  ROUTES,
  type LikeState,
  type NotificationLevel,
  type VideoDetailDTO,
} from '@kelvyntube/shared';
import { api } from '@/lib/api';

/**
 * ═══════════════════════════════════════════════════════════════════════════
 *  DONNÉES DE LA VIDÉO REGARDÉE
 *  Une seule entrée de cache `['video', id]` sert de source de vérité :
 *  like, abonnement et compteurs y sont écrits de façon optimiste.
 * ═══════════════════════════════════════════════════════════════════════════
 */

export function videoQueryKey(videoId: string) {
  return ['video', videoId] as const;
}

interface LikeResult {
  like: LikeState;
  likeCount: number;
  dislikeCount: number | null;
}

interface SubscribeResult {
  subscribed: boolean;
  level: NotificationLevel | null;
  subscriberCount: number;
}

export interface UseWatchVideoOptions {
  videoId: string;
  /** Vidéo récupérée côté serveur (rendu immédiat, sans état spectateur). */
  initialVideo: VideoDetailDTO | null;
}

export function useWatchVideo({ videoId, initialVideo }: UseWatchVideoOptions) {
  const queryClient = useQueryClient();
  const queryKey = useMemo(() => videoQueryKey(videoId), [videoId]);

  const seed = initialVideo?.id === videoId ? initialVideo : undefined;

  const query = useQuery<VideoDetailDTO>({
    queryKey,
    queryFn: () =>
      api.get<VideoDetailDTO>(ROUTES.videos.byId(videoId), {
        allowAnonymous: true,
      }),
    initialData: seed,
    // Les données serveur sont anonymes : on les considère périmées d'emblée
    // pour rapatrier immédiatement l'état du spectateur (like, abonnement…).
    initialDataUpdatedAt: seed ? 0 : undefined,
  });

  const patch = useCallback(
    (updater: (video: VideoDetailDTO) => VideoDetailDTO) => {
      queryClient.setQueryData<VideoDetailDTO>(queryKey, (old) =>
        old ? updater(old) : old,
      );
    },
    [queryClient, queryKey],
  );

  /** Compteur de vues (temps réel / heartbeats du lecteur). */
  const setViewCount = useCallback(
    (viewCount: number) => {
      patch((video) =>
        video.viewCount === viewCount ? video : { ...video, viewCount },
      );
    },
    [patch],
  );

  // ── Like / dislike : optimiste avec rollback ─────────────────────────────
  const setLike = useCallback(
    async (direction: Exclude<LikeState, 'NONE'>) => {
      const current = queryClient.getQueryData<VideoDetailDTO>(queryKey);
      if (!current) return;

      const previous = current.viewer.like;
      const previousLikeCount = current.likeCount;
      const previousDislikeCount = current.dislikeCount;

      const next: LikeState = previous === direction ? 'NONE' : direction;
      const value = next === 'LIKE' ? 1 : next === 'DISLIKE' ? -1 : 0;
      const likeDelta = (next === 'LIKE' ? 1 : 0) - (previous === 'LIKE' ? 1 : 0);
      const dislikeDelta =
        (next === 'DISLIKE' ? 1 : 0) - (previous === 'DISLIKE' ? 1 : 0);

      patch((video) => ({
        ...video,
        likeCount: Math.max(0, video.likeCount + likeDelta),
        dislikeCount:
          video.dislikeCount === null
            ? null
            : Math.max(0, video.dislikeCount + dislikeDelta),
        viewer: { ...video.viewer, like: next },
      }));

      try {
        const result = await api.post<LikeResult>(
          ROUTES.videos.like(videoId),
          { value },
        );
        patch((video) => ({
          ...video,
          likeCount: result.likeCount,
          dislikeCount: result.dislikeCount,
          viewer: { ...video.viewer, like: result.like },
        }));
      } catch (error) {
        patch((video) => ({
          ...video,
          likeCount: previousLikeCount,
          dislikeCount: previousDislikeCount,
          viewer: { ...video.viewer, like: previous },
        }));
        throw error;
      }
    },
    [patch, queryClient, queryKey, videoId],
  );

  // ── Abonnement ───────────────────────────────────────────────────────────
  const applySubscription = useCallback(
    (result: SubscribeResult) => {
      patch((video) => ({
        ...video,
        channel: {
          ...video.channel,
          subscriberCount: result.subscriberCount,
          viewer: {
            ...video.channel.viewer,
            isSubscribed: result.subscribed,
            notificationLevel: result.level,
          },
        },
        viewer: {
          ...video.viewer,
          isSubscribed: result.subscribed,
          notificationLevel: result.level,
        },
      }));
    },
    [patch],
  );

  const subscribe = useCallback(
    async (level: NotificationLevel = 'PERSONALIZED') => {
      const current = queryClient.getQueryData<VideoDetailDTO>(queryKey);
      if (!current) return;
      const channelId = current.channel.id;

      applySubscription({
        subscribed: true,
        level,
        subscriberCount: current.channel.subscriberCount + 1,
      });
      try {
        const result = await api.post<SubscribeResult>(
          ROUTES.channels.subscribe(channelId),
          { level },
        );
        applySubscription(result);
      } catch (error) {
        applySubscription({
          subscribed: current.viewer.isSubscribed,
          level: current.viewer.notificationLevel,
          subscriberCount: current.channel.subscriberCount,
        });
        throw error;
      }
    },
    [applySubscription, queryClient, queryKey],
  );

  const unsubscribe = useCallback(async () => {
    const current = queryClient.getQueryData<VideoDetailDTO>(queryKey);
    if (!current) return;
    const channelId = current.channel.id;

    applySubscription({
      subscribed: false,
      level: null,
      subscriberCount: Math.max(0, current.channel.subscriberCount - 1),
    });
    try {
      const result = await api.delete<SubscribeResult>(
        ROUTES.channels.unsubscribe(channelId),
      );
      applySubscription(result);
    } catch (error) {
      applySubscription({
        subscribed: current.viewer.isSubscribed,
        level: current.viewer.notificationLevel,
        subscriberCount: current.channel.subscriberCount,
      });
      throw error;
    }
  }, [applySubscription, queryClient, queryKey]);

  const setNotificationLevel = useCallback(
    async (level: NotificationLevel) => {
      const current = queryClient.getQueryData<VideoDetailDTO>(queryKey);
      if (!current) return;
      const channelId = current.channel.id;

      applySubscription({
        subscribed: true,
        level,
        subscriberCount: current.channel.subscriberCount,
      });
      try {
        const result = await api.patch<SubscribeResult>(
          ROUTES.subscriptions.updateLevel(channelId),
          { level },
        );
        applySubscription(result);
      } catch (error) {
        applySubscription({
          subscribed: current.viewer.isSubscribed,
          level: current.viewer.notificationLevel,
          subscriberCount: current.channel.subscriberCount,
        });
        throw error;
      }
    },
    [applySubscription, queryClient, queryKey],
  );

  return {
    video: query.data,
    loading: query.isPending,
    error: query.error,
    setViewCount,
    setLike,
    subscribe,
    unsubscribe,
    setNotificationLevel,
  };
}
