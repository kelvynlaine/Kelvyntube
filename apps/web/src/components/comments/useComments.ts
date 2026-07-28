'use client';

import {
  useCallback,
  useEffect,
  useLayoutEffect,
  useMemo,
  useRef,
  useState,
} from 'react';
import {
  useInfiniteQuery,
  useQueryClient,
  type InfiniteData,
} from '@tanstack/react-query';
import {
  ROUTES,
  WS_EVENTS,
  type CommentDTO,
  type CommentSort,
  type CursorPage,
  type LikeState,
} from '@kelvyntube/shared';
import { api } from '@/lib/api';
import { useRealtimeEvent } from '@/lib/realtime-context';

/**
 * ═══════════════════════════════════════════════════════════════════════════
 *  ÉTAT DU FIL DE COMMENTAIRES
 *  - pagination infinie (`GET /videos/:id/comments`)
 *  - réponses chargées à la demande (`GET /comments/:id/replies`)
 *  - mises à jour optimistes (envoi, like, réactions, épinglage…)
 *  - insertion temps réel des nouveaux commentaires sans casser le scroll
 * ═══════════════════════════════════════════════════════════════════════════
 */

const PAGE_SIZE = 20;
const REPLIES_PAGE_SIZE = 30;

type CommentPage = CursorPage<CommentDTO>;
type CommentInfinite = InfiniteData<CommentPage, string | null>;

/** Commentaire en cours d'envoi (affiché immédiatement, grisé). */
export interface PendingComment {
  /** Identifiant temporaire, remplacé par celui du serveur. */
  tempId: string;
  comment: CommentDTO;
  failed: boolean;
}

/** `useLayoutEffect` sans avertissement lors du rendu serveur. */
const useIsomorphicLayoutEffect =
  typeof window !== 'undefined' ? useLayoutEffect : useEffect;

/** Applique `updater` au commentaire `id`, à n'importe quelle profondeur. */
function patchTree(
  list: CommentDTO[],
  id: string,
  updater: (comment: CommentDTO) => CommentDTO,
): CommentDTO[] {
  return list.map((comment) => {
    const next = comment.id === id ? updater(comment) : comment;
    if (!next.replies?.length) return next;
    return { ...next, replies: patchTree(next.replies, id, updater) };
  });
}

/** Retire le commentaire `id` de l'arbre (et décrémente le compteur du parent). */
function removeFromTree(list: CommentDTO[], id: string): CommentDTO[] {
  return list
    .filter((comment) => comment.id !== id)
    .map((comment) => {
      if (!comment.replies?.length) return comment;
      const replies = removeFromTree(comment.replies, id);
      if (replies.length === comment.replies.length) return comment;
      return {
        ...comment,
        replies,
        replyCount: Math.max(0, comment.replyCount - 1),
      };
    });
}

/** Fusionne deux listes en dédupliquant par identifiant (la 1re gagne). */
function dedupe(...lists: CommentDTO[][]): CommentDTO[] {
  const seen = new Set<string>();
  const out: CommentDTO[] = [];
  for (const list of lists) {
    for (const comment of list) {
      if (seen.has(comment.id)) continue;
      seen.add(comment.id);
      out.push(comment);
    }
  }
  return out;
}

/** Collecte tous les identifiants d'un arbre de commentaires. */
function collectIds(list: CommentDTO[], into: Set<string>): void {
  for (const comment of list) {
    into.add(comment.id);
    if (comment.replies?.length) collectIds(comment.replies, into);
  }
}

/** Squelette local d'un commentaire en attente de confirmation serveur. */
function buildOptimisticComment(params: {
  tempId: string;
  text: string;
  parentId: string | null;
  author: CommentDTO['author'];
}): CommentDTO {
  return {
    id: params.tempId,
    text: params.text,
    author: params.author,
    parentId: params.parentId,
    likeCount: 0,
    replyCount: 0,
    pinned: false,
    heartedByCreator: false,
    edited: false,
    createdAt: new Date().toISOString(),
    reactions: [],
    viewer: { like: 'NONE', canDelete: true, canModerate: false },
  };
}

export interface UseCommentsOptions {
  videoId: string;
  /** Faux quand les commentaires sont désactivés sur la vidéo. */
  enabled: boolean;
  /** Identifiant de l'utilisateur connecté (dédoublonnage temps réel). */
  currentUserId?: string | null;
}

export function useComments({
  videoId,
  enabled,
  currentUserId,
}: UseCommentsOptions) {
  const queryClient = useQueryClient();
  const [sort, setSort] = useState<CommentSort>('top');
  const [expandedIds, setExpandedIds] = useState<string[]>([]);
  const [loadingReplyIds, setLoadingReplyIds] = useState<string[]>([]);
  /** Commentaires reçus par WebSocket depuis l'ouverture de la page. */
  const [liveComments, setLiveComments] = useState<CommentDTO[]>([]);
  const [pending, setPending] = useState<PendingComment[]>([]);

  const queryKey = useMemo(
    () => ['comments', videoId, sort] as const,
    [videoId, sort],
  );

  const query = useInfiniteQuery<
    CommentPage,
    Error,
    CommentInfinite,
    readonly unknown[],
    string | null
  >({
    queryKey,
    enabled,
    initialPageParam: null,
    queryFn: ({ pageParam }) =>
      api.get<CommentPage>(ROUTES.comments.list(videoId), {
        query: { cursor: pageParam ?? undefined, limit: PAGE_SIZE, sort },
        allowAnonymous: true,
      }),
    getNextPageParam: (lastPage) => lastPage.nextCursor,
  });

  // Le fil temps réel et les envois optimistes repartent de zéro à chaque vidéo.
  useEffect(() => {
    setLiveComments([]);
    setPending([]);
    setExpandedIds([]);
    setLoadingReplyIds([]);
  }, [videoId]);

  // ── Mise à jour transverse (cache react-query + listes locales) ──────────
  const patch = useCallback(
    (id: string, updater: (comment: CommentDTO) => CommentDTO) => {
      queryClient.setQueryData<CommentInfinite>(queryKey, (old) =>
        old
          ? {
              ...old,
              pages: old.pages.map((page) => ({
                ...page,
                items: patchTree(page.items, id, updater),
              })),
            }
          : old,
      );
      setLiveComments((current) => patchTree(current, id, updater));
      setPending((current) =>
        current.map((item) =>
          item.comment.id === id
            ? { ...item, comment: updater(item.comment) }
            : item,
        ),
      );
    },
    [queryClient, queryKey],
  );

  const drop = useCallback(
    (id: string) => {
      queryClient.setQueryData<CommentInfinite>(queryKey, (old) =>
        old
          ? {
              ...old,
              pages: old.pages.map((page) => ({
                ...page,
                items: removeFromTree(page.items, id),
              })),
            }
          : old,
      );
      setLiveComments((current) => removeFromTree(current, id));
    },
    [queryClient, queryKey],
  );

  // ── Liste finale affichée ────────────────────────────────────────────────
  const serverComments = useMemo(
    () => query.data?.pages.flatMap((page) => page.items) ?? [],
    [query.data],
  );

  const comments = useMemo(
    () => dedupe(liveComments, serverComments),
    [liveComments, serverComments],
  );

  /** Identifiants déjà connus : évite les doublons venus du WebSocket. */
  const knownIdsRef = useRef<Set<string>>(new Set());
  useEffect(() => {
    const ids = new Set<string>();
    collectIds(comments, ids);
    knownIdsRef.current = ids;
  }, [comments]);

  // ── Temps réel : insertion en tête sans décaler le scroll ────────────────
  const scrollAnchorRef = useRef<number | null>(null);

  useIsomorphicLayoutEffect(() => {
    const before = scrollAnchorRef.current;
    if (before === null) return;
    scrollAnchorRef.current = null;
    const delta = document.documentElement.scrollHeight - before;
    // On ne compense que si l'utilisateur a déjà défilé sous le lecteur.
    if (delta > 0 && window.scrollY > 0) window.scrollBy(0, delta);
  }, [liveComments.length]);

  const onRealtimeComment = useCallback(
    (payload: unknown) => {
      const dto = payload as CommentDTO | null;
      if (!dto || typeof dto.id !== 'string' || !dto.author) return;
      // Nos propres commentaires sont déjà affichés de façon optimiste.
      if (currentUserId && dto.author.id === currentUserId) return;

      if (dto.parentId) {
        // Réponse : on incrémente le compteur, et on l'ajoute si le fil est ouvert.
        patch(dto.parentId, (parent) => ({
          ...parent,
          replyCount: parent.replyCount + 1,
          replies: parent.replies
            ? dedupe(parent.replies, [dto])
            : parent.replies,
        }));
        return;
      }

      if (knownIdsRef.current.has(dto.id)) return;
      knownIdsRef.current.add(dto.id);
      scrollAnchorRef.current = document.documentElement.scrollHeight;
      setLiveComments((current) =>
        current.some((item) => item.id === dto.id) ? current : [dto, ...current],
      );
    },
    [currentUserId, patch],
  );

  useRealtimeEvent(
    WS_EVENTS.commentCreated,
    onRealtimeComment,
    enabled ? `video:${videoId}` : undefined,
  );

  // ── Réponses à la demande ────────────────────────────────────────────────
  const toggleReplies = useCallback(
    async (comment: CommentDTO) => {
      const open = expandedIds.includes(comment.id);
      if (open) {
        setExpandedIds((current) => current.filter((id) => id !== comment.id));
        return;
      }

      const loaded = comment.replies?.length ?? 0;
      setExpandedIds((current) => [...current, comment.id]);
      if (loaded >= comment.replyCount) return;

      setLoadingReplyIds((current) => [...current, comment.id]);
      try {
        const page = await api.get<CommentPage>(
          ROUTES.comments.replies(comment.id),
          { query: { limit: REPLIES_PAGE_SIZE }, allowAnonymous: true },
        );
        patch(comment.id, (parent) => ({
          ...parent,
          replies: dedupe(parent.replies ?? [], page.items),
        }));
      } finally {
        setLoadingReplyIds((current) =>
          current.filter((id) => id !== comment.id),
        );
      }
    },
    [expandedIds, patch],
  );

  // ── Envoi (optimiste) ────────────────────────────────────────────────────
  const create = useCallback(
    async (text: string, parentId: string | null, author: CommentDTO['author']) => {
      const trimmed = text.trim();
      if (!trimmed) return;

      const tempId = `temp-${Date.now()}-${Math.random().toString(16).slice(2)}`;
      const optimistic = buildOptimisticComment({
        tempId,
        text: trimmed,
        parentId,
        author,
      });

      if (parentId) {
        // Réponse : affichée immédiatement sous son parent.
        patch(parentId, (parent) => ({
          ...parent,
          replyCount: parent.replyCount + 1,
          replies: [...(parent.replies ?? []), optimistic],
        }));
        setExpandedIds((current) =>
          current.includes(parentId) ? current : [...current, parentId],
        );
      } else {
        setPending((current) => [
          { tempId, comment: optimistic, failed: false },
          ...current,
        ]);
      }

      try {
        const created = await api.post<CommentDTO>(
          ROUTES.comments.create(videoId),
          { text: trimmed, parentId: parentId ?? undefined },
        );

        if (parentId) {
          patch(parentId, (parent) => ({
            ...parent,
            replies: (parent.replies ?? []).map((reply) =>
              reply.id === tempId ? created : reply,
            ),
          }));
        } else {
          setPending((current) => current.filter((item) => item.tempId !== tempId));
          knownIdsRef.current.add(created.id);
          setLiveComments((current) =>
            current.some((item) => item.id === created.id)
              ? current
              : [created, ...current],
          );
        }
      } catch (error) {
        if (parentId) {
          patch(parentId, (parent) => ({
            ...parent,
            replyCount: Math.max(0, parent.replyCount - 1),
            replies: (parent.replies ?? []).filter((reply) => reply.id !== tempId),
          }));
        } else {
          setPending((current) =>
            current.map((item) =>
              item.tempId === tempId ? { ...item, failed: true } : item,
            ),
          );
        }
        throw error;
      }
    },
    [patch, videoId],
  );

  /** Abandonne un envoi resté en échec. */
  const discardPending = useCallback((tempId: string) => {
    setPending((current) => current.filter((item) => item.tempId !== tempId));
  }, []);

  // ── Like / dislike (optimiste avec rollback) ─────────────────────────────
  const setLike = useCallback(
    async (comment: CommentDTO, direction: Exclude<LikeState, 'NONE'>) => {
      const previous = comment.viewer.like;
      const next: LikeState = previous === direction ? 'NONE' : direction;
      const value = next === 'LIKE' ? 1 : next === 'DISLIKE' ? -1 : 0;
      const delta = (next === 'LIKE' ? 1 : 0) - (previous === 'LIKE' ? 1 : 0);

      patch(comment.id, (item) => ({
        ...item,
        likeCount: Math.max(0, item.likeCount + delta),
        viewer: { ...item.viewer, like: next },
      }));

      try {
        const result = await api.post<{ like: LikeState; likeCount: number }>(
          ROUTES.comments.like(comment.id),
          { value },
        );
        patch(comment.id, (item) => ({
          ...item,
          likeCount: result.likeCount,
          viewer: { ...item.viewer, like: result.like },
        }));
      } catch (error) {
        patch(comment.id, (item) => ({
          ...item,
          likeCount: comment.likeCount,
          viewer: { ...item.viewer, like: previous },
        }));
        throw error;
      }
    },
    [patch],
  );

  // ── Réaction emoji (optimiste) ───────────────────────────────────────────
  const react = useCallback(
    async (comment: CommentDTO, emoji: string) => {
      patch(comment.id, (item) => {
        const existing = item.reactions.find((r) => r.emoji === emoji);
        const reactions = existing
          ? item.reactions
              .map((r) =>
                r.emoji === emoji
                  ? {
                      ...r,
                      reacted: !r.reacted,
                      count: Math.max(0, r.count + (r.reacted ? -1 : 1)),
                    }
                  : r,
              )
              .filter((r) => r.count > 0)
          : [...item.reactions, { emoji, count: 1, reacted: true }];
        return { ...item, reactions };
      });

      try {
        const updated = await api.post<CommentDTO>(
          ROUTES.comments.react(comment.id),
          { emoji },
        );
        patch(comment.id, (item) => ({ ...updated, replies: item.replies }));
      } catch (error) {
        patch(comment.id, () => comment);
        throw error;
      }
    },
    [patch],
  );

  // ── Modération & édition ─────────────────────────────────────────────────
  const edit = useCallback(
    async (comment: CommentDTO, text: string) => {
      const updated = await api.patch<CommentDTO>(
        ROUTES.comments.update(comment.id),
        { text },
      );
      patch(comment.id, (item) => ({ ...updated, replies: item.replies }));
    },
    [patch],
  );

  const remove = useCallback(
    async (comment: CommentDTO) => {
      await api.delete<{ deleted: true; id: string }>(
        ROUTES.comments.delete(comment.id),
      );
      drop(comment.id);
    },
    [drop],
  );

  const pin = useCallback(
    async (comment: CommentDTO) => {
      const updated = await api.post<CommentDTO>(ROUTES.comments.pin(comment.id));
      patch(comment.id, (item) => ({ ...updated, replies: item.replies }));
    },
    [patch],
  );

  const heart = useCallback(
    async (comment: CommentDTO) => {
      const updated = await api.post<CommentDTO>(
        ROUTES.comments.heart(comment.id),
      );
      patch(comment.id, (item) => ({ ...updated, replies: item.replies }));
    },
    [patch],
  );

  return {
    comments,
    pending,
    sort,
    setSort,
    loading: query.isPending && enabled,
    hasMore: Boolean(query.hasNextPage),
    loadingMore: query.isFetchingNextPage,
    loadMore: () => void query.fetchNextPage(),
    expandedIds,
    loadingReplyIds,
    toggleReplies,
    create,
    discardPending,
    setLike,
    react,
    edit,
    remove,
    pin,
    heart,
    /** Nombre de commentaires ajoutés localement depuis le chargement. */
    localCount: liveComments.length + pending.length,
  };
}

export type UseCommentsResult = ReturnType<typeof useComments>;
