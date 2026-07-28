'use client';

import {
  useInfiniteQuery,
  useMutation,
  useQuery,
  useQueryClient,
} from '@tanstack/react-query';
import {
  ROUTES,
  type CursorPage,
  type NotificationLevel,
  type PlaylistDetailDTO,
  type PlaylistSummaryDTO,
  type SubscriptionDTO,
  type VideoCardDTO,
} from '@kelvyntube/shared';
import { api } from '@/lib/api';

/**
 * ═══════════════════════════════════════════════════════════════════════════
 *  ACCÈS AUX DONNÉES DE LA BIBLIOTHÈQUE
 *  Toutes les requêtes des pages Bibliothèque / Historique / Playlists /
 *  Abonnements passent par ce module : clés de cache centralisées (pour des
 *  invalidations ciblées) et client `api` typé — jamais de `fetch` brut.
 * ═══════════════════════════════════════════════════════════════════════════
 */

/** Taille de page commune à toutes les listes paginées de la section. */
export const LIBRARY_PAGE_SIZE = 24;

/** Élément d'historique : une `VideoCardDTO` enrichie de la progression. */
export interface HistoryItemDTO extends VideoCardDTO {
  watchedAt: string;
  positionSec: number;
  watchedPct: number;
}

/** Clés de cache — un seul endroit pour savoir quoi invalider. */
export const libraryKeys = {
  history: (q: string) => ['library', 'history', q] as const,
  historyRoot: ['library', 'history'] as const,
  liked: ['library', 'liked'] as const,
  watchLater: ['library', 'watch-later'] as const,
  playlists: ['library', 'playlists'] as const,
  playlist: (id: string) => ['library', 'playlist', id] as const,
  subscriptions: ['library', 'subscriptions'] as const,
  subscriptionsFeed: ['library', 'subscriptions', 'feed'] as const,
  channelVideos: (channelId: string) =>
    ['library', 'channel-videos', channelId] as const,
};

/** Aplatit les pages d'une `useInfiniteQuery` en une seule liste. */
export function flattenPages<T>(
  data: { pages: CursorPage<T>[] } | undefined,
): T[] {
  return data ? data.pages.flatMap((page) => page.items) : [];
}

/**
 * Fabrique une requête infinie sur un endpoint paginé par curseur.
 * Le curseur est opaque : on le renvoie tel quel à l'API.
 */
function useCursorPages<T>(
  queryKey: readonly unknown[],
  path: string,
  options: {
    enabled?: boolean;
    query?: Record<string, string | number | undefined>;
  } = {},
) {
  return useInfiniteQuery({
    queryKey,
    enabled: options.enabled ?? true,
    initialPageParam: undefined as string | undefined,
    queryFn: ({ pageParam }: { pageParam: string | undefined }) =>
      api.get<CursorPage<T>>(path, {
        query: {
          ...options.query,
          cursor: pageParam,
          limit: LIBRARY_PAGE_SIZE,
        },
      }),
    getNextPageParam: (lastPage: CursorPage<T>) => lastPage.nextCursor ?? undefined,
  });
}

// ── Historique ────────────────────────────────────────────────────────────

/** Historique de visionnage, filtrable par titre (`q`). */
export function useHistory(search: string, enabled = true) {
  return useCursorPages<HistoryItemDTO>(
    libraryKeys.history(search),
    ROUTES.library.history,
    { enabled, query: { q: search || undefined } },
  );
}

// ── Vidéos likées / À regarder plus tard ──────────────────────────────────

export function useLikedVideos(enabled = true) {
  return useCursorPages<VideoCardDTO>(libraryKeys.liked, ROUTES.library.liked, {
    enabled,
  });
}

export function useWatchLater(enabled = true) {
  return useCursorPages<VideoCardDTO>(
    libraryKeys.watchLater,
    ROUTES.library.watchLater,
    { enabled },
  );
}

// ── Playlists ─────────────────────────────────────────────────────────────

/** Playlists de l'utilisateur (les playlists système arrivent en tête). */
export function usePlaylists(enabled = true) {
  return useQuery({
    queryKey: libraryKeys.playlists,
    enabled,
    queryFn: () => api.get<PlaylistSummaryDTO[]>(ROUTES.playlists.list),
  });
}

/** Détail d'une playlist (items ordonnés inclus). */
export function usePlaylistDetail(playlistId: string | null) {
  return useQuery({
    queryKey: libraryKeys.playlist(playlistId ?? ''),
    enabled: Boolean(playlistId),
    queryFn: () => api.get<PlaylistDetailDTO>(ROUTES.playlists.byId(playlistId as string)),
  });
}

// ── Abonnements ───────────────────────────────────────────────────────────

export function useSubscriptions(enabled = true) {
  return useQuery({
    queryKey: libraryKeys.subscriptions,
    enabled,
    queryFn: () => api.get<SubscriptionDTO[]>(ROUTES.subscriptions.list),
  });
}

export function useSubscriptionsFeed(enabled = true) {
  return useCursorPages<VideoCardDTO>(
    libraryKeys.subscriptionsFeed,
    ROUTES.subscriptions.feed,
    { enabled },
  );
}

/** Réponse commune des routes d'abonnement. */
interface SubscribeResult {
  subscribed: boolean;
  level: NotificationLevel | null;
  subscriberCount: number;
}

/**
 * Mutations d'abonnement partagées par le bandeau de chaînes et l'onglet
 * « Gérer ». Mise à jour optimiste de la liste, puis invalidation ciblée.
 */
export function useSubscriptionMutations() {
  const queryClient = useQueryClient();

  /** Applique une transformation locale immédiate sur la liste en cache. */
  const patchList = async (
    update: (list: SubscriptionDTO[]) => SubscriptionDTO[],
  ) => {
    await queryClient.cancelQueries({ queryKey: libraryKeys.subscriptions });
    const previous = queryClient.getQueryData<SubscriptionDTO[]>(
      libraryKeys.subscriptions,
    );
    if (previous) {
      queryClient.setQueryData(libraryKeys.subscriptions, update(previous));
    }
    return previous;
  };

  const rollback = (previous: SubscriptionDTO[] | undefined) => {
    if (previous) queryClient.setQueryData(libraryKeys.subscriptions, previous);
  };

  const invalidate = () => {
    void queryClient.invalidateQueries({ queryKey: libraryKeys.subscriptions });
    void queryClient.invalidateQueries({
      queryKey: libraryKeys.subscriptionsFeed,
    });
  };

  const setLevel = useMutation({
    mutationFn: ({
      channelId,
      level,
    }: {
      channelId: string;
      level: NotificationLevel;
    }) =>
      api.patch<SubscribeResult>(ROUTES.subscriptions.updateLevel(channelId), {
        level,
      }),
    onMutate: ({ channelId, level }) =>
      patchList((list) =>
        list.map((sub) =>
          sub.channel.id === channelId ? { ...sub, level } : sub,
        ),
      ),
    onError: (_error, _vars, previous) => rollback(previous),
    onSettled: invalidate,
  });

  const unsubscribe = useMutation({
    mutationFn: (channelId: string) =>
      api.delete<SubscribeResult>(ROUTES.channels.unsubscribe(channelId)),
    onMutate: (channelId) =>
      patchList((list) => list.filter((sub) => sub.channel.id !== channelId)),
    onError: (_error, _vars, previous) => rollback(previous),
    onSettled: invalidate,
  });

  const subscribe = useMutation({
    mutationFn: ({
      channelId,
      level = 'PERSONALIZED',
    }: {
      channelId: string;
      level?: NotificationLevel;
    }) =>
      api.post<SubscribeResult>(ROUTES.channels.subscribe(channelId), { level }),
    onSettled: invalidate,
  });

  return { setLevel, unsubscribe, subscribe };
}

// ── Vidéos d'une chaîne (section « Vos vidéos ») ───────────────────────────

export function useChannelVideos(channelId: string | null) {
  return useQuery({
    queryKey: libraryKeys.channelVideos(channelId ?? ''),
    enabled: Boolean(channelId),
    queryFn: () =>
      api.get<CursorPage<VideoCardDTO>>(
        ROUTES.channels.videos(channelId as string),
        { query: { limit: 12 } },
      ),
  });
}
