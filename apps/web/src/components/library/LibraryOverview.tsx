'use client';

import Link from 'next/link';
import { Clock, History, Library, ListVideo, ThumbsUp, Video } from 'lucide-react';
import type { VideoCardDTO } from '@kelvyntube/shared';
import { EmptyState, Skeleton, VideoCard, VideoCardSkeleton } from '@kelvyntube/ui';
import { PATHS } from '@/lib/nav';
import { useAuth } from '@/lib/auth-context';
import {
  HorizontalItem,
  HorizontalScroller,
  LibraryAuthGate,
  LibraryHeader,
  LibraryPage,
  SectionHeader,
} from './LibraryShell';
import { PlaylistCard } from './PlaylistCard';
import {
  flattenPages,
  useChannelVideos,
  useHistory,
  useLikedVideos,
  usePlaylists,
  useWatchLater,
} from './queries';

/**
 * ═══════════════════════════════════════════════════════════════════════════
 *  PAGE « BIBLIOTHÈQUE »
 *  Aperçu de toute la section : historique, playlists, vidéos likées et
 *  vidéos de la chaîne de l'utilisateur.
 * ═══════════════════════════════════════════════════════════════════════════
 */
export function LibraryOverview() {
  return (
    <LibraryAuthGate
      icon={<Library size={28} aria-hidden="true" />}
      title="Profitez de votre bibliothèque"
      description="Connectez-vous pour retrouver votre historique, vos playlists et vos vidéos likées."
    >
      <LibraryOverviewContent />
    </LibraryAuthGate>
  );
}

/** Rangée horizontale de vidéos avec squelette et état vide. */
function VideoRow({
  videos,
  loading,
  label,
  emptyLabel,
}: {
  videos: VideoCardDTO[];
  loading: boolean;
  label: string;
  emptyLabel: string;
}) {
  if (loading) {
    return (
      <HorizontalScroller label={label}>
        {Array.from({ length: 5 }, (_, index) => (
          <HorizontalItem key={index}>
            <VideoCardSkeleton />
          </HorizontalItem>
        ))}
      </HorizontalScroller>
    );
  }

  if (videos.length === 0) {
    return (
      <p className="rounded-kt bg-bg-elevated px-4 py-6 text-kt-base text-fg-muted">
        {emptyLabel}
      </p>
    );
  }

  return (
    <HorizontalScroller label={label}>
      {videos.map((video) => (
        <HorizontalItem key={video.id}>
          <VideoCard video={video} linkComponent={Link} />
        </HorizontalItem>
      ))}
    </HorizontalScroller>
  );
}

function LibraryOverviewContent() {
  const { activeChannel } = useAuth();

  const history = useHistory('');
  const liked = useLikedVideos();
  const watchLater = useWatchLater();
  const playlists = usePlaylists();
  const channelVideos = useChannelVideos(activeChannel?.id ?? null);

  // Aperçu : les dix derniers éléments de chaque section suffisent.
  const historyVideos = flattenPages(history.data).slice(0, 10);
  const likedVideos = flattenPages(liked.data).slice(0, 10);
  const watchLaterVideos = flattenPages(watchLater.data).slice(0, 10);

  return (
    <LibraryPage>
      <LibraryHeader
        icon={<Library size={24} aria-hidden="true" />}
        title="Bibliothèque"
      />

      <div className="flex flex-col gap-10">
        {/* ── Historique ───────────────────────────────────────────────── */}
        <section aria-label="Historique">
          <SectionHeader
            icon={<History size={20} aria-hidden="true" />}
            title="Historique"
            href={PATHS.history}
          />
          <VideoRow
            videos={historyVideos}
            loading={history.isLoading}
            label="Dernières vidéos regardées"
            emptyLabel="Les vidéos que vous regardez apparaîtront ici."
          />
        </section>

        {/* ── Playlists ────────────────────────────────────────────────── */}
        <section aria-label="Playlists">
          <SectionHeader
            icon={<ListVideo size={20} aria-hidden="true" />}
            title="Playlists"
            href={PATHS.playlists}
          />

          {playlists.isLoading ? (
            <div className="kt-video-grid" aria-hidden="true">
              {Array.from({ length: 4 }, (_, index) => (
                <Skeleton key={index} className="aspect-video w-full rounded-kt" />
              ))}
            </div>
          ) : (playlists.data?.length ?? 0) === 0 ? (
            <p className="rounded-kt bg-bg-elevated px-4 py-6 text-kt-base text-fg-muted">
              Vous n'avez pas encore de playlist.
            </p>
          ) : (
            <div className="kt-video-grid">
              {playlists.data?.slice(0, 6).map((playlist) => (
                <PlaylistCard
                  key={playlist.id}
                  playlist={playlist}
                  href={
                    playlist.kind === 'WATCH_LATER'
                      ? PATHS.watchLater
                      : playlist.kind === 'LIKED'
                        ? PATHS.liked
                        : undefined
                  }
                />
              ))}
            </div>
          )}
        </section>

        {/* ── Vidéos likées ────────────────────────────────────────────── */}
        <section aria-label="Vidéos likées">
          <SectionHeader
            icon={<ThumbsUp size={20} aria-hidden="true" />}
            title="Vidéos likées"
            href={PATHS.liked}
          />
          <VideoRow
            videos={likedVideos}
            loading={liked.isLoading}
            label="Vidéos likées"
            emptyLabel="Les vidéos que vous likez apparaîtront ici."
          />
        </section>

        {/* ── À regarder plus tard ─────────────────────────────────────── */}
        <section aria-label="À regarder plus tard">
          <SectionHeader
            icon={<Clock size={20} aria-hidden="true" />}
            title="À regarder plus tard"
            href={PATHS.watchLater}
          />
          <VideoRow
            videos={watchLaterVideos}
            loading={watchLater.isLoading}
            label="Vidéos à regarder plus tard"
            emptyLabel="Mettez des vidéos de côté pour les retrouver ici."
          />
        </section>

        {/* ── Vos vidéos (si l'utilisateur a une chaîne) ───────────────── */}
        {activeChannel ? (
          <section aria-label="Vos vidéos">
            <SectionHeader
              icon={<Video size={20} aria-hidden="true" />}
              title="Vos vidéos"
              href={PATHS.myVideos}
            />
            <VideoRow
              videos={channelVideos.data?.items ?? []}
              loading={channelVideos.isLoading}
              label="Vidéos de votre chaîne"
              emptyLabel="Votre chaîne n'a pas encore publié de vidéo."
            />
          </section>
        ) : (
          <section>
            <EmptyState
              size="sm"
              icon={<Video size={24} aria-hidden="true" />}
              title="Créez votre chaîne"
              description="Une chaîne vous permet de publier vos propres vidéos sur Kelvyn Tube."
              action={
                <Link href={PATHS.studio} className="kt-btn-primary h-9 px-4">
                  Créer une chaîne
                </Link>
              }
            />
          </section>
        )}
      </div>
    </LibraryPage>
  );
}
