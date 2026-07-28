'use client';

import { MessagesSquare } from 'lucide-react';
import { EmptyState } from '@kelvyntube/ui';
import { ChannelTabPanel } from '@/components/channel/ChannelTabs';
import { ChannelErrorState, LoadMoreButton } from '@/components/channel/ChannelStates';
import { CommunityComposer } from '@/components/channel/CommunityComposer';
import {
  CommunityPostCard,
  CommunityPostSkeleton,
} from '@/components/channel/CommunityPostCard';
import { flattenPages, useChannelPosts } from '@/components/channel/queries';
import { useCurrentChannel } from '@/components/channel/useChannelRoute';

/** Onglet Communauté : publications de la chaîne (+ composeur pour le propriétaire). */
export default function ChannelCommunityPage() {
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
  } = useChannelPosts(channel?.id);

  const posts = flattenPages(data?.pages);

  return (
    <ChannelTabPanel tab="communaute">
      <div className="max-w-3xl">
        {channel?.viewer.isOwner ? (
          <div className="mb-8">
            <CommunityComposer channel={channel} />
          </div>
        ) : null}

        {isPending ? (
          <div className="flex flex-col gap-6">
            {Array.from({ length: 3 }, (_, i) => (
              <CommunityPostSkeleton key={i} />
            ))}
          </div>
        ) : isError ? (
          <ChannelErrorState error={error} onRetry={() => void refetch()} />
        ) : posts.length === 0 ? (
          <EmptyState
            icon={<MessagesSquare size={28} />}
            title="Aucune publication"
            description="Cette chaîne n’a encore rien publié dans l’onglet Communauté."
          />
        ) : (
          <>
            <div className="flex flex-col gap-6">
              {posts.map((post) => (
                <CommunityPostCard key={post.id} post={post} />
              ))}
            </div>
            <LoadMoreButton
              hasNextPage={hasNextPage}
              isFetchingNextPage={isFetchingNextPage}
              onLoadMore={() => void fetchNextPage()}
            />
          </>
        )}
      </div>
    </ChannelTabPanel>
  );
}
