'use client';

import { useInfiniteQuery, useQuery } from '@tanstack/react-query';
import {
  DEFAULT_PAGE_SIZE,
  ROUTES,
  type ChannelDTO,
  type ChannelSummaryDTO,
  type CursorPage,
  type PlaylistSummaryDTO,
  type VideoCardDTO,
  type VideoDetailDTO,
} from '@kelvyntube/shared';
import { api, ApiClientError } from '@/lib/api';

/**
 * ═══════════════════════════════════════════════════════════════════════════
 *  ACCÈS AUX DONNÉES DES PAGES DE CHAÎNE
 *  Un seul endroit pour les clés React Query et les formes de réponse
 *  propres aux onglets (celles qui ne figurent pas dans `@kelvyntube/shared`).
 * ═══════════════════════════════════════════════════════════════════════════
 */

/** Publication communautaire renvoyée par `GET /channels/:id/posts`. */
export interface ChannelPostDTO {
  id: string;
  text: string;
  imageUrl: string | null;
  likeCount: number;
  createdAt: string;
  channel: ChannelSummaryDTO;
}

/** Réponse de `GET /channels/:id/home`. */
export interface ChannelHomeDTO {
  trailer: VideoCardDTO | null;
  featured: VideoCardDTO[];
  sections: { title: string; videos: VideoCardDTO[] }[];
}

/** Ordre de tri de l'onglet Vidéos / Shorts. */
export type ChannelVideoSort = 'recent' | 'popular' | 'oldest';

/** Clés React Query — partagées entre l'en-tête et les onglets. */
export const channelKeys = {
  byHandle: (handle: string) => ['channel', 'handle', handle] as const,
  home: (channelId: string) => ['channel', channelId, 'home'] as const,
  videos: (channelId: string, sort: ChannelVideoSort) =>
    ['channel', channelId, 'videos', sort] as const,
  shorts: (channelId: string) => ['channel', channelId, 'shorts'] as const,
  playlists: (channelId: string) => ['channel', channelId, 'playlists'] as const,
  posts: (channelId: string) => ['channel', channelId, 'posts'] as const,
  trailer: (videoId: string) => ['channel', 'trailer', videoId] as const,
};

/** Vrai si l'erreur correspond à une chaîne (ou ressource) inexistante. */
export function isNotFound(error: unknown): boolean {
  return error instanceof ApiClientError && error.status === 404;
}

/** Message lisible pour un bloc d'erreur. */
export function errorMessage(error: unknown): string {
  if (error instanceof ApiClientError) return error.message;
  return 'Une erreur est survenue. Réessaie dans un instant.';
}

// ── Chaîne ─────────────────────────────────────────────────────────────────

/** Profil complet de la chaîne — source de vérité de l'en-tête et des onglets. */
export function useChannel(handle: string) {
  return useQuery({
    queryKey: channelKeys.byHandle(handle),
    queryFn: () => api.get<ChannelDTO>(ROUTES.channels.byHandle(handle)),
    enabled: handle.length > 0,
    retry: (failureCount, error) => !isNotFound(error) && failureCount < 1,
  });
}

// ── Onglet Accueil ─────────────────────────────────────────────────────────

export function useChannelHome(channelId: string | undefined) {
  return useQuery({
    queryKey: channelKeys.home(channelId ?? ''),
    queryFn: () => api.get<ChannelHomeDTO>(`${ROUTES.channels.byId(channelId!)}/home`),
    enabled: Boolean(channelId),
  });
}

/**
 * Détail d'une vidéo — utilisé uniquement pour récupérer le `mp4FallbackUrl`
 * de la bande-annonce (le lecteur complet appartient à un autre module).
 */
export function useTrailerDetail(videoId: string | undefined) {
  return useQuery({
    queryKey: channelKeys.trailer(videoId ?? ''),
    queryFn: () => api.get<VideoDetailDTO>(ROUTES.videos.byId(videoId!)),
    enabled: Boolean(videoId),
    retry: false,
  });
}

// ── Onglets paginés ────────────────────────────────────────────────────────

/** Page de vidéos longues, triée. */
export function useChannelVideos(
  channelId: string | undefined,
  sort: ChannelVideoSort,
) {
  return useInfiniteQuery({
    queryKey: channelKeys.videos(channelId ?? '', sort),
    enabled: Boolean(channelId),
    initialPageParam: undefined as string | undefined,
    queryFn: ({ pageParam }) =>
      api.get<CursorPage<VideoCardDTO>>(ROUTES.channels.videos(channelId!), {
        query: { cursor: pageParam, limit: DEFAULT_PAGE_SIZE, sort },
      }),
    getNextPageParam: (last) => last.nextCursor ?? undefined,
  });
}

/** Page de Shorts (verticaux). */
export function useChannelShorts(channelId: string | undefined) {
  return useInfiniteQuery({
    queryKey: channelKeys.shorts(channelId ?? ''),
    enabled: Boolean(channelId),
    initialPageParam: undefined as string | undefined,
    queryFn: ({ pageParam }) =>
      api.get<CursorPage<VideoCardDTO>>(ROUTES.channels.shorts(channelId!), {
        query: { cursor: pageParam, limit: DEFAULT_PAGE_SIZE },
      }),
    getNextPageParam: (last) => last.nextCursor ?? undefined,
  });
}

/** Playlists publiques de la chaîne (liste complète, non paginée côté API). */
export function useChannelPlaylists(channelId: string | undefined) {
  return useQuery({
    queryKey: channelKeys.playlists(channelId ?? ''),
    queryFn: () => api.get<PlaylistSummaryDTO[]>(ROUTES.channels.playlists(channelId!)),
    enabled: Boolean(channelId),
  });
}

/** Publications de l'onglet Communauté. */
export function useChannelPosts(channelId: string | undefined) {
  return useInfiniteQuery({
    queryKey: channelKeys.posts(channelId ?? ''),
    enabled: Boolean(channelId),
    initialPageParam: undefined as string | undefined,
    queryFn: ({ pageParam }) =>
      api.get<CursorPage<ChannelPostDTO>>(ROUTES.channels.posts(channelId!), {
        query: { cursor: pageParam, limit: DEFAULT_PAGE_SIZE },
      }),
    getNextPageParam: (last) => last.nextCursor ?? undefined,
  });
}

/** Aplatit les pages d'une requête infinie. */
export function flattenPages<T>(pages: CursorPage<T>[] | undefined): T[] {
  return pages?.flatMap((page) => page.items) ?? [];
}
