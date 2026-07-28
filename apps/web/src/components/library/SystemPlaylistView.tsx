'use client';

import Link from 'next/link';
import { useRouter } from 'next/navigation';
import { Clock, ThumbsUp } from 'lucide-react';
import { useCallback } from 'react';
import { EmptyState, VideoCardSkeleton } from '@kelvyntube/ui';
import { PATHS } from '@/lib/nav';
import {
  InfiniteSentinel,
  LibraryAuthGate,
  LibraryPage,
} from './LibraryShell';
import { PlaylistHero, PlaylistLayout } from './PlaylistHero';
import { PlaylistItemList } from './PlaylistItemList';
import { flattenPages, useLikedVideos, usePlaylists, useWatchLater } from './queries';

/**
 * ═══════════════════════════════════════════════════════════════════════════
 *  PAGES « VIDÉOS LIKÉES » ET « À REGARDER PLUS TARD »
 *  Mise en page playlist : panneau latéral gauche + liste numérotée à droite.
 * ═══════════════════════════════════════════════════════════════════════════
 */

type SystemKind = 'LIKED' | 'WATCH_LATER';

const META: Record<SystemKind, { title: string; description: string; empty: string }> = {
  LIKED: {
    title: 'Vidéos likées',
    description: 'Toutes les vidéos auxquelles vous avez mis un « j’aime ».',
    empty: 'Les vidéos que vous likez apparaîtront ici.',
  },
  WATCH_LATER: {
    title: 'À regarder plus tard',
    description: 'Les vidéos que vous mettez de côté pour plus tard.',
    empty: 'Ajoutez des vidéos depuis le menu « ⋮ » d’une miniature.',
  },
};

export function SystemPlaylistView({ kind }: { kind: SystemKind }) {
  const meta = META[kind];

  return (
    <LibraryAuthGate
      icon={
        kind === 'LIKED' ? (
          <ThumbsUp size={28} aria-hidden="true" />
        ) : (
          <Clock size={28} aria-hidden="true" />
        )
      }
      title={meta.title}
      description={`Connectez-vous pour retrouver « ${meta.title} ».`}
      skeleton="playlist"
    >
      <SystemPlaylistContent kind={kind} />
    </LibraryAuthGate>
  );
}

function SystemPlaylistContent({ kind }: { kind: SystemKind }) {
  const router = useRouter();
  const meta = META[kind];

  const liked = useLikedVideos(kind === 'LIKED');
  const watchLater = useWatchLater(kind === 'WATCH_LATER');
  const query = kind === 'LIKED' ? liked : watchLater;

  // La playlist système fournit l'identifiant `?list=` et le compteur total.
  const playlists = usePlaylists();
  const systemPlaylist = playlists.data?.find((playlist) => playlist.kind === kind);

  const items = flattenPages(query.data);
  const first = items[0];
  const listId = systemPlaylist?.id ?? null;

  /** Lecture aléatoire : la destination n'est connue qu'au moment du clic. */
  const shuffle = useCallback(() => {
    if (items.length === 0) return;
    const random = items[Math.floor(Math.random() * items.length)];
    router.push(PATHS.watch(random.id, listId ? { list: listId } : undefined));
  }, [items, listId, router]);

  return (
    <LibraryPage>
      <PlaylistLayout
        hero={
          <PlaylistHero
            title={meta.title}
            description={meta.description}
            kind={kind}
            visibility={systemPlaylist?.visibility ?? 'PRIVATE'}
            itemCount={systemPlaylist?.itemCount ?? items.length}
            thumbnailUrl={first?.thumbnailUrl ?? systemPlaylist?.thumbnailUrl ?? null}
            playAllHref={
              first ? PATHS.watch(first.id, listId ? { list: listId } : undefined) : null
            }
            onShuffle={shuffle}
          />
        }
      >
        {query.isLoading ? (
          <div className="flex flex-col gap-3" aria-hidden="true">
            {Array.from({ length: 6 }, (_, index) => (
              <VideoCardSkeleton key={index} layout="compact" />
            ))}
          </div>
        ) : (
          <PlaylistItemList
            items={items}
            listId={listId}
            empty={
              <EmptyState
                icon={
                  kind === 'LIKED' ? (
                    <ThumbsUp size={28} aria-hidden="true" />
                  ) : (
                    <Clock size={28} aria-hidden="true" />
                  )
                }
                title="Aucune vidéo pour le moment"
                description={meta.empty}
                action={
                  <Link href={PATHS.home} className="kt-btn-primary h-9 px-4">
                    Découvrir des vidéos
                  </Link>
                }
              />
            }
            footer={
              <InfiniteSentinel
                hasMore={Boolean(query.hasNextPage)}
                loading={query.isFetchingNextPage}
                onLoadMore={() => void query.fetchNextPage()}
              >
                <div className="flex flex-col gap-3" aria-hidden="true">
                  {Array.from({ length: 3 }, (_, index) => (
                    <VideoCardSkeleton key={index} layout="compact" />
                  ))}
                </div>
              </InfiniteSentinel>
            }
          />
        )}
      </PlaylistLayout>
    </LibraryPage>
  );
}
