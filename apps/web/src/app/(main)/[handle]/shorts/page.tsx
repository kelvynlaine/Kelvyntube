'use client';

import { Zap } from 'lucide-react';
import { EmptyState } from '@kelvyntube/ui';
import { ChannelTabPanel } from '@/components/channel/ChannelTabs';
import { ChannelErrorState, LoadMoreButton } from '@/components/channel/ChannelStates';
import {
  SHORTS_GRID_CLASS,
  ShortCard,
  ShortCardSkeleton,
} from '@/components/channel/ShortCard';
import { flattenPages, useChannelShorts } from '@/components/channel/queries';
import { useCurrentChannel } from '@/components/channel/useChannelRoute';

/** Onglet Shorts : grille de cartes verticales 9:16. */
export default function ChannelShortsPage() {
  const { channel } = useCurrentChannel();
  const {
    data,
    isPending,
    isError,
    error,
    refetch,
    fetchNextPage,
    hasNextPage,
    isFetchingNextPage,
  } = useChannelShorts(channel?.id);

  const shorts = flattenPages(data?.pages);

  return (
    <ChannelTabPanel tab="shorts">
      {isPending ? (
        <div className={SHORTS_GRID_CLASS}>
          {Array.from({ length: 10 }, (_, i) => (
            <ShortCardSkeleton key={i} />
          ))}
        </div>
      ) : isError ? (
        <ChannelErrorState error={error} onRetry={() => void refetch()} />
      ) : shorts.length === 0 ? (
        <EmptyState
          icon={<Zap size={28} />}
          title="Aucun Short pour le moment"
          description="Cette chaîne n’a pas encore publié de vidéo courte."
        />
      ) : (
        <>
          <div className={SHORTS_GRID_CLASS}>
            {shorts.map((video) => (
              <ShortCard key={video.id} video={video} />
            ))}
          </div>
          <LoadMoreButton
            hasNextPage={hasNextPage}
            isFetchingNextPage={isFetchingNextPage}
            onLoadMore={() => void fetchNextPage()}
          />
        </>
      )}
    </ChannelTabPanel>
  );
}
