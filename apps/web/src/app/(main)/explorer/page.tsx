'use client';

import Link from 'next/link';
import { useQuery } from '@tanstack/react-query';
import {
  ROUTES,
  formatCompactNumber,
  type CategoryDTO,
  type ChannelSummaryDTO,
  type CursorPage,
  type TagDTO,
} from '@kelvyntube/shared';
import { ChannelAvatar, EmptyState, Skeleton } from '@kelvyntube/ui';
import { Compass, Hash } from 'lucide-react';
import { CategoryCard, FeedErrorState } from '@/components/feed';
import { api } from '@/lib/api';
import { PATHS } from '@/lib/nav';

const POPULAR_CHANNELS_LIMIT = 12;

/** Explorer : catégories, hashtags tendances et chaînes populaires. */
export default function ExplorePage() {
  const categoriesQuery = useQuery({
    queryKey: ['feed', 'categories'],
    queryFn: () => api.get<CategoryDTO[]>(ROUTES.feed.categories),
    staleTime: 10 * 60_000,
  });

  const tagsQuery = useQuery({
    queryKey: ['tags', 'trending'],
    queryFn: () => api.get<TagDTO[]>(ROUTES.tags.trending),
    staleTime: 5 * 60_000,
  });

  const channelsQuery = useQuery({
    queryKey: ['channels', 'popular', POPULAR_CHANNELS_LIMIT],
    queryFn: () =>
      api.get<CursorPage<ChannelSummaryDTO>>(ROUTES.channels.list, {
        query: { limit: POPULAR_CHANNELS_LIMIT },
        allowAnonymous: true,
      }),
    staleTime: 5 * 60_000,
  });

  return (
    <div className="flex flex-col gap-10">
      <header className="flex items-center gap-3">
        <span
          aria-hidden="true"
          className="flex size-10 items-center justify-center rounded-full bg-bg-elevated text-fg"
        >
          <Compass size={22} />
        </span>
        <h1 className="text-kt-xl font-medium text-fg">Explorer</h1>
      </header>

      {/* ── Catégories ──────────────────────────────────────────────────── */}
      <section aria-labelledby="explorer-categories" className="flex flex-col gap-4">
        <h2 id="explorer-categories" className="text-kt-lg font-medium text-fg">
          Catégories
        </h2>

        {categoriesQuery.isError ? (
          <FeedErrorState
            title="Impossible de charger les catégories"
            onRetry={() => void categoriesQuery.refetch()}
            retrying={categoriesQuery.isFetching}
          />
        ) : (
          <div className="grid grid-cols-2 gap-4 feed-3:grid-cols-3 feed-4:grid-cols-4 feed-6:grid-cols-6">
            {categoriesQuery.isLoading
              ? Array.from({ length: 12 }).map((_, index) => (
                  <Skeleton key={index} className="h-28 w-full rounded-kt-lg" />
                ))
              : (categoriesQuery.data ?? []).map((category, index) => (
                  <CategoryCard key={category.id} category={category} index={index} />
                ))}
          </div>
        )}
      </section>

      {/* ── Hashtags tendances ──────────────────────────────────────────── */}
      <section aria-labelledby="explorer-hashtags" className="flex flex-col gap-4">
        <h2
          id="explorer-hashtags"
          className="flex items-center gap-2 text-kt-lg font-medium text-fg"
        >
          <Hash size={20} aria-hidden="true" className="text-fg-muted" />
          Hashtags tendances
        </h2>

        {tagsQuery.isError ? (
          <FeedErrorState
            title="Impossible de charger les hashtags"
            onRetry={() => void tagsQuery.refetch()}
            retrying={tagsQuery.isFetching}
          />
        ) : tagsQuery.isLoading ? (
          <div className="flex flex-wrap gap-2">
            {Array.from({ length: 12 }).map((_, index) => (
              <Skeleton key={index} className="h-8 w-28 rounded-pill" />
            ))}
          </div>
        ) : (tagsQuery.data ?? []).length === 0 ? (
          <EmptyState
            size="sm"
            icon={<Hash size={22} />}
            title="Aucun hashtag pour le moment"
          />
        ) : (
          <ul className="flex flex-wrap gap-2">
            {(tagsQuery.data ?? []).map((tag) => (
              <li key={tag.id}>
                <Link href={PATHS.hashtag(tag.name)} className="kt-chip inline-flex gap-2">
                  <span>#{tag.name}</span>
                  <span className="text-fg-muted tabular-nums">
                    {formatCompactNumber(tag.usageCount)}
                  </span>
                </Link>
              </li>
            ))}
          </ul>
        )}
      </section>

      {/* ── Chaînes populaires ──────────────────────────────────────────── */}
      <section aria-labelledby="explorer-channels" className="flex flex-col gap-4">
        <h2 id="explorer-channels" className="text-kt-lg font-medium text-fg">
          Chaînes populaires
        </h2>

        {channelsQuery.isError ? (
          <FeedErrorState
            title="Impossible de charger les chaînes"
            onRetry={() => void channelsQuery.refetch()}
            retrying={channelsQuery.isFetching}
          />
        ) : (
          <ul className="grid grid-cols-2 gap-4 xs:grid-cols-3 feed-3:grid-cols-4 feed-5:grid-cols-6">
            {channelsQuery.isLoading
              ? Array.from({ length: POPULAR_CHANNELS_LIMIT }).map((_, index) => (
                  <li
                    key={index}
                    className="flex flex-col items-center gap-2 rounded-kt bg-bg-elevated p-4"
                  >
                    <Skeleton variant="circle" className="size-16" />
                    <Skeleton variant="text" className="h-3 w-24" />
                    <Skeleton variant="text" className="h-3 w-16" />
                  </li>
                ))
              : (channelsQuery.data?.items ?? []).map((channel) => (
                  <li key={channel.id} className="rounded-kt bg-bg-elevated p-4">
                    <ChannelAvatar
                      channel={channel}
                      size="lg"
                      showName
                      showSubscribers
                      linkComponent={Link}
                      href={PATHS.channel(channel.handle)}
                      className="flex-col text-center"
                    />
                  </li>
                ))}
          </ul>
        )}
      </section>
    </div>
  );
}
