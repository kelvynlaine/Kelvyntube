'use client';

import { useMemo } from 'react';
import Link from 'next/link';
import { useInfiniteQuery } from '@tanstack/react-query';
import {
  ROUTES,
  formatCompactNumber,
  type CommentDTO,
  type CursorPage,
} from '@kelvyntube/shared';
import { CommentThread, EmptyState, Sheet, useMediaQuery } from '@kelvyntube/ui';
import { MessageSquare } from 'lucide-react';
import { api } from '@/lib/api';
import { FeedErrorState } from './FeedErrorState';

const COMMENTS_PAGE_SIZE = 20;

export interface ShortsCommentsSheetProps {
  videoId: string;
  open: boolean;
  onClose: () => void;
  commentCount: number;
  /** Nom de la chaîne (infobulle du cœur du créateur). */
  creatorName?: string;
}

/**
 * Feuille latérale des commentaires d'un Short.
 * Lecture seule : la rédaction se fait sur la page de visionnage.
 */
export function ShortsCommentsSheet({
  videoId,
  open,
  onClose,
  commentCount,
  creatorName,
}: ShortsCommentsSheetProps) {
  /*
   * Sur mobile les commentaires arrivent par le bas (comportement YouTube
   * Shorts) : une feuille latérale de 420 px couvrirait tout l'écran et
   * masquerait la vidéo. À partir de `feed-3` (900 px) on garde le panneau
   * de droite, qui laisse le Short visible.
   */
  const isDesktop = useMediaQuery('(min-width: 900px)');

  const query = useInfiniteQuery({
    queryKey: ['comments', videoId, 'top'],
    enabled: open,
    initialPageParam: null as string | null,
    queryFn: ({ pageParam }) =>
      api.get<CursorPage<CommentDTO>>(ROUTES.comments.list(videoId), {
        query: {
          cursor: pageParam ?? undefined,
          limit: COMMENTS_PAGE_SIZE,
          sort: 'top',
        },
        allowAnonymous: true,
      }),
    getNextPageParam: (lastPage) => lastPage.nextCursor,
  });

  const comments = useMemo(
    () => query.data?.pages.flatMap((page) => page.items) ?? [],
    [query.data],
  );

  return (
    <Sheet
      open={open}
      onClose={onClose}
      side={isDesktop ? 'right' : 'bottom'}
      title={`Commentaires · ${formatCompactNumber(commentCount)}`}
      sizeClassName={isDesktop ? 'w-[min(420px,100vw)]' : 'h-[70dvh] max-h-[70dvh]'}
    >
      {/* Le bas suit la safe-area iOS : le dernier commentaire reste lisible. */}
      <div className="px-4 pb-[calc(1rem+env(safe-area-inset-bottom))] pt-4">
        {query.isError ? (
          <FeedErrorState
            title="Commentaires indisponibles"
            description="Le chargement des commentaires a échoué."
            onRetry={() => void query.refetch()}
            retrying={query.isFetching}
          />
        ) : (
          <CommentThread
            comments={comments}
            totalCount={commentCount}
            loading={query.isLoading}
            hasMore={query.hasNextPage}
            loadingMore={query.isFetchingNextPage}
            onLoadMore={() => void query.fetchNextPage()}
            creatorName={creatorName}
            linkComponent={Link}
            emptyState={
              <EmptyState
                size="sm"
                icon={<MessageSquare size={22} />}
                title="Aucun commentaire"
                description="Soyez le premier à réagir à ce Short."
              />
            }
          />
        )}
      </div>
    </Sheet>
  );
}
