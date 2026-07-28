'use client';

import { useMemo, useState } from 'react';
import Link from 'next/link';
import { useInfiniteQuery, useQuery } from '@tanstack/react-query';
import {
  ROUTES,
  formatCompactNumber,
  formatViews,
  type ChannelSummaryDTO,
  type CursorPage,
  type TagDTO,
  type VideoCardDTO,
} from '@kelvyntube/shared';
import {
  Badge,
  ChannelAvatar,
  EmptyState,
  Skeleton,
  Tabs,
  type TabItem,
} from '@kelvyntube/ui';
import { Flame, Hash } from 'lucide-react';
import { api } from '@/lib/api';
import { PATHS } from '@/lib/nav';
import { FeedErrorState } from './FeedErrorState';
import { InfiniteFeed } from './InfiniteFeed';
import { VideoGrid } from './VideoGrid';
import { useImpressionTracker } from './useImpressionTracker';

/** Réponse de `GET /tags/:name`. */
interface TagOverviewDTO {
  tag: TagDTO;
  videoCount: number;
  totalViews: number;
  topChannels: ChannelSummaryDTO[];
}

type TagSort = 'recent' | 'popular';

const PAGE_SIZE = 24;

const SORT_TABS: TabItem[] = [
  { id: 'recent', label: 'Récent' },
  { id: 'popular', label: 'Populaire' },
];

export interface HashtagPageContentProps {
  /** Nom du hashtag normalisé (sans « # »). */
  tag: string;
}

/** Page d'un hashtag : en-tête, tri et grille paginée. */
export function HashtagPageContent({ tag }: HashtagPageContentProps) {
  const [sort, setSort] = useState<TagSort>('recent');
  const { trackImpression, trackClick } = useImpressionTracker({ source: 'SEARCH' });

  const encoded = encodeURIComponent(tag);

  const overviewQuery = useQuery({
    queryKey: ['tag', tag],
    queryFn: () =>
      api.get<TagOverviewDTO>(ROUTES.tags.byName(encoded), { allowAnonymous: true }),
    staleTime: 60_000,
  });

  const videosQuery = useInfiniteQuery({
    queryKey: ['tag', tag, 'videos', sort],
    initialPageParam: null as string | null,
    queryFn: ({ pageParam }) =>
      api.get<CursorPage<VideoCardDTO>>(ROUTES.tags.videos(encoded), {
        query: { cursor: pageParam ?? undefined, limit: PAGE_SIZE, sort },
        allowAnonymous: true,
      }),
    getNextPageParam: (lastPage) => lastPage.nextCursor,
  });

  const videos = useMemo(
    () => videosQuery.data?.pages.flatMap((page) => page.items) ?? [],
    [videosQuery.data],
  );

  const overview = overviewQuery.data;

  return (
    <div className="flex flex-col gap-6">
      {/* ── En-tête ─────────────────────────────────────────────────────── */}
      <header className="flex flex-col gap-4">
        <div className="flex flex-wrap items-center gap-3">
          <h1 className="break-all text-kt-xl font-medium text-fg xs:text-4xl">
            #{tag}
          </h1>
          {overview?.tag.trending ? (
            <Badge variant="brand" icon={<Flame size={12} aria-hidden="true" />}>
              Tendance
            </Badge>
          ) : null}
        </div>

        {overviewQuery.isLoading ? (
          <Skeleton variant="text" className="h-4 w-56" />
        ) : overview ? (
          <p className="text-kt-base text-fg-muted">
            {formatCompactNumber(overview.videoCount)}{' '}
            {overview.videoCount > 1 ? 'vidéos' : 'vidéo'} ·{' '}
            {formatViews(overview.totalViews)}
          </p>
        ) : null}

        {overview && overview.topChannels.length > 0 ? (
          <section className="flex flex-col gap-2">
            <h2 className="text-kt-sm font-medium uppercase tracking-wide text-fg-subtle">
              Chaînes les plus actives
            </h2>
            <ul className="kt-no-scrollbar flex gap-4 overflow-x-auto pb-1">
              {overview.topChannels.map((channel) => (
                <li key={channel.id} className="shrink-0">
                  <ChannelAvatar
                    channel={channel}
                    size="md"
                    showName
                    showSubscribers
                    linkComponent={Link}
                    href={PATHS.channel(channel.handle)}
                  />
                </li>
              ))}
            </ul>
          </section>
        ) : null}
      </header>

      {/* ── Tri ─────────────────────────────────────────────────────────── */}
      <Tabs
        items={SORT_TABS}
        value={sort}
        onChange={(id) => setSort(id as TagSort)}
        label="Trier les vidéos"
        panelIdPrefix="hashtag"
      />

      {/* ── Vidéos ──────────────────────────────────────────────────────── */}
      <div
        id={`hashtag-${sort}`}
        role="tabpanel"
        aria-labelledby={`hashtag-tab-${sort}`}
      >
        {videosQuery.isError && videos.length === 0 ? (
          <FeedErrorState
            onRetry={() => void videosQuery.refetch()}
            retrying={videosQuery.isFetching}
          />
        ) : (
          <VideoGrid
            videos={videos}
            loading={videosQuery.isLoading}
            onImpression={trackImpression}
            onVideoClick={(video) => trackClick(video.id)}
            emptyState={
              <EmptyState
                icon={<Hash size={26} />}
                title="Aucune vidéo pour ce hashtag"
                description="Aucune vidéo publique ne porte encore ce hashtag."
              />
            }
          />
        )}
      </div>

      {videos.length > 0 ? (
        <InfiniteFeed
          hasNextPage={videosQuery.hasNextPage}
          isFetchingNextPage={videosQuery.isFetchingNextPage}
          hasError={videosQuery.isError}
          onLoadMore={() => void videosQuery.fetchNextPage()}
          endMessage="Vous avez tout vu."
        />
      ) : null}
    </div>
  );
}
