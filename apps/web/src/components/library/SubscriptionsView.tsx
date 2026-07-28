'use client';

import Link from 'next/link';
import { LayoutGrid, List, Users } from 'lucide-react';
import { useState } from 'react';
import type { NotificationLevel, SubscriptionDTO } from '@kelvyntube/shared';
import {
  ChannelAvatar,
  EmptyState,
  IconButton,
  Skeleton,
  SubscribeButton,
  Tabs,
  VideoCard,
  VideoCardSkeleton,
  cn,
} from '@kelvyntube/ui';
import { PATHS } from '@/lib/nav';
import {
  InfiniteSentinel,
  LibraryAuthGate,
  LibraryHeader,
  LibraryPage,
  VideoGridSkeleton,
} from './LibraryShell';
import { SubscriptionRail } from './SubscriptionRail';
import { useLibraryToast, useLocalStorageState } from './hooks';
import {
  flattenPages,
  useSubscriptionMutations,
  useSubscriptions,
  useSubscriptionsFeed,
} from './queries';

/**
 * ═══════════════════════════════════════════════════════════════════════════
 *  PAGE « ABONNEMENTS »
 *  Onglet « Vidéos » : bandeau des chaînes + feed paginé (grille ou liste).
 *  Onglet « Gérer »  : liste des chaînes suivies avec niveau de cloche.
 * ═══════════════════════════════════════════════════════════════════════════
 */
export function SubscriptionsView() {
  return (
    <LibraryAuthGate
      icon={<Users size={28} aria-hidden="true" />}
      title="Suivez vos chaînes préférées"
      description="Connectez-vous pour retrouver les dernières vidéos de vos abonnements."
    >
      <SubscriptionsContent />
    </LibraryAuthGate>
  );
}

type SubsTab = 'videos' | 'manage';

function SubscriptionsContent() {
  const [tab, setTab] = useState<SubsTab>('videos');
  const [view, setView] = useLocalStorageState<'grid' | 'list'>(
    'kt:subscriptions-view',
    'grid',
  );

  const subscriptions = useSubscriptions();
  const feed = useSubscriptionsFeed();
  const videos = flattenPages(feed.data);

  const channels = subscriptions.data ?? [];

  return (
    <LibraryPage>
      <LibraryHeader
        icon={<Users size={24} aria-hidden="true" />}
        title="Abonnements"
        actions={
          tab === 'videos' ? (
            <span className="flex items-center gap-1">
              <IconButton
                size="sm"
                aria-label="Affichage en grille"
                aria-pressed={view === 'grid'}
                active={view === 'grid'}
                onClick={() => setView('grid')}
              >
                <LayoutGrid size={18} />
              </IconButton>
              <IconButton
                size="sm"
                aria-label="Affichage en liste"
                aria-pressed={view === 'list'}
                active={view === 'list'}
                onClick={() => setView('list')}
              >
                <List size={18} />
              </IconButton>
            </span>
          ) : null
        }
      />

      <div className="mb-4">
        <SubscriptionRail
          subscriptions={channels}
          loading={subscriptions.isLoading}
        />
      </div>

      <Tabs
        items={[
          { id: 'videos', label: 'Vidéos' },
          {
            id: 'manage',
            label: 'Gérer les abonnements',
            badge: channels.length > 0 ? channels.length : undefined,
          },
        ]}
        value={tab}
        onChange={(id) => setTab(id as SubsTab)}
        label="Vues des abonnements"
        panelIdPrefix="kt-subs"
        className="mb-6"
      />

      {tab === 'videos' ? (
        <div
          id="kt-subs-videos"
          role="tabpanel"
          aria-labelledby="kt-subs-tab-videos"
          tabIndex={0}
        >
          {feed.isLoading ? (
            <VideoGridSkeleton />
          ) : videos.length === 0 ? (
            <EmptyState
              icon={<Users size={28} aria-hidden="true" />}
              title="Aucune vidéo dans vos abonnements"
              description="Abonnez-vous à des chaînes pour voir leurs nouveautés ici."
              action={
                <Link href={PATHS.explore} className="kt-btn-primary h-9 px-4">
                  Explorer les chaînes
                </Link>
              }
            />
          ) : (
            <div
              className={cn(
                view === 'grid' ? 'kt-video-grid' : 'flex flex-col gap-4',
              )}
            >
              {videos.map((video) => (
                <VideoCard
                  key={video.id}
                  video={video}
                  layout={view === 'grid' ? 'grid' : 'list'}
                  linkComponent={Link}
                />
              ))}
            </div>
          )}

          <InfiniteSentinel
            hasMore={Boolean(feed.hasNextPage)}
            loading={feed.isFetchingNextPage}
            onLoadMore={() => void feed.fetchNextPage()}
          >
            <div
              className={cn(
                view === 'grid' ? 'kt-video-grid' : 'flex flex-col gap-4',
              )}
              aria-hidden="true"
            >
              {Array.from({ length: 4 }, (_, index) => (
                <VideoCardSkeleton
                  key={index}
                  layout={view === 'grid' ? 'grid' : 'list'}
                />
              ))}
            </div>
          </InfiniteSentinel>
        </div>
      ) : (
        <div
          id="kt-subs-manage"
          role="tabpanel"
          aria-labelledby="kt-subs-tab-manage"
          tabIndex={0}
        >
          <ManageSubscriptions
            subscriptions={channels}
            loading={subscriptions.isLoading}
          />
        </div>
      )}
    </LibraryPage>
  );
}

/** Onglet « Gérer les abonnements » : cloche et désabonnement par chaîne. */
function ManageSubscriptions({
  subscriptions,
  loading,
}: {
  subscriptions: SubscriptionDTO[];
  loading: boolean;
}) {
  const toast = useLibraryToast();
  const { setLevel, unsubscribe, subscribe } = useSubscriptionMutations();

  if (loading) {
    return (
      <ul className="flex flex-col gap-4" aria-hidden="true">
        {Array.from({ length: 6 }, (_, index) => (
          <li key={index} className="flex items-center gap-4">
            <Skeleton variant="circle" className="size-12" />
            <div className="flex flex-1 flex-col gap-2">
              <Skeleton variant="text" className="h-4 w-40" />
              <Skeleton variant="text" className="h-3 w-24" />
            </div>
            <Skeleton className="h-9 w-32 rounded-pill" />
          </li>
        ))}
      </ul>
    );
  }

  if (subscriptions.length === 0) {
    return (
      <EmptyState
        icon={<Users size={28} aria-hidden="true" />}
        title="Aucun abonnement"
        description="Les chaînes auxquelles vous vous abonnez apparaîtront ici."
        action={
          <Link href={PATHS.explore} className="kt-btn-primary h-9 px-4">
            Explorer les chaînes
          </Link>
        }
      />
    );
  }

  return (
    <ul className="flex flex-col divide-y divide-border">
      {subscriptions.map((sub) => (
        <li
          key={sub.channel.id}
          className="flex flex-wrap items-center justify-between gap-4 py-4"
        >
          <ChannelAvatar
            channel={sub.channel}
            size="md"
            showName
            showSubscribers
            linkComponent={Link}
            className="min-w-0 flex-1"
          />

          <div className="flex items-center gap-3">
            <SubscribeButton
              subscribed
              notificationLevel={sub.level}
              onSubscribe={() =>
                subscribe.mutate({ channelId: sub.channel.id })
              }
              onUnsubscribe={() => {
                unsubscribe.mutate(sub.channel.id);
                toast({ message: `Désabonné de ${sub.channel.name}` });
              }}
              onLevelChange={(level: NotificationLevel) =>
                setLevel.mutate({ channelId: sub.channel.id, level })
              }
            />
          </div>
        </li>
      ))}
    </ul>
  );
}
