'use client';

import Link from 'next/link';
import { useState } from 'react';
import { Video } from 'lucide-react';
import { Chip, EmptyState, VideoCard } from '@kelvyntube/ui';
import { PATHS } from '@/lib/nav';
import { ChannelTabPanel } from '@/components/channel/ChannelTabs';
import {
  ChannelErrorState,
  ChannelGridSkeleton,
  LoadMoreButton,
} from '@/components/channel/ChannelStates';
import {
  flattenPages,
  useChannelVideos,
  type ChannelVideoSort,
} from '@/components/channel/queries';
import { useCurrentChannel } from '@/components/channel/useChannelRoute';

const SORTS: { id: ChannelVideoSort; label: string }[] = [
  { id: 'recent', label: 'Récentes' },
  { id: 'popular', label: 'Populaires' },
  { id: 'oldest', label: 'Anciennes' },
];

/** Onglet Vidéos : grille paginée + chips de tri. */
export default function ChannelVideosPage() {
  const { channel } = useCurrentChannel();
  const [sort, setSort] = useState<ChannelVideoSort>('recent');
  const {
    data,
    isPending,
    isError,
    error,
    refetch,
    fetchNextPage,
    hasNextPage,
    isFetchingNextPage,
  } = useChannelVideos(channel?.id, sort);

  const videos = flattenPages(data?.pages);

  return (
    <ChannelTabPanel tab="videos">
      <div
        role="group"
        aria-label="Trier les vidéos"
        className="kt-no-scrollbar flex gap-2 overflow-x-auto"
      >
        {SORTS.map((option) => (
          <Chip
            key={option.id}
            active={sort === option.id}
            onClick={() => setSort(option.id)}
          >
            {option.label}
          </Chip>
        ))}
      </div>

      {isPending ? (
        <ChannelGridSkeleton />
      ) : isError ? (
        <ChannelErrorState error={error} onRetry={() => void refetch()} />
      ) : videos.length === 0 ? (
        <EmptyState
          icon={<Video size={28} />}
          title="Aucune vidéo pour le moment"
          description="Cette chaîne n’a pas encore publié de vidéo longue."
        />
      ) : (
        <>
          <div className="kt-video-grid">
            {videos.map((video) => (
              <VideoCard
                key={video.id}
                video={video}
                layout="grid"
                showChannel={false}
                linkComponent={Link}
                href={PATHS.watch(video.id)}
              />
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
