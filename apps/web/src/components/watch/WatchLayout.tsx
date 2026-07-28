'use client';

import { useCallback, useEffect, useMemo, useRef, useState } from 'react';
import { useRouter } from 'next/navigation';
import { cn, EmptyState, useToast } from '@kelvyntube/ui';
import {
  WS_EVENTS,
  type TrafficSource,
  type VideoCardDTO,
  type VideoDetailDTO,
} from '@kelvyntube/shared';
import { VideoPlayer } from '@/components/player';
import { CommentsSection } from '@/components/comments';
import { useAuth } from '@/lib/auth-context';
import { PATHS } from '@/lib/nav';
import { readPlayerPreferences } from '@/lib/player-storage';
import { useRealtimeEvent } from '@/lib/realtime-context';
import { AutoplayOverlay } from './AutoplayOverlay';
import { PlaylistPanel, usePlaylist } from './PlaylistPanel';
import { RelatedVideos, useRelatedVideos } from './RelatedVideos';
import { VideoInfo } from './VideoInfo';
import { WatchSkeleton } from './WatchSkeleton';
import { usePlayerBridge } from './usePlayerBridge';
import { useWatchVideo } from './useWatchVideo';

export interface WatchLayoutProps {
  videoId: string;
  /** Vidéo pré-chargée côté serveur (métadonnées + premier rendu). */
  initialVideo: VideoDetailDTO | null;
  /** Paramètre `?t=` (prioritaire sur la reprise de lecture). */
  startAtParam: number | null;
  /** Paramètre `?list=`. */
  playlistId: string | null;
}

/**
 * ═══════════════════════════════════════════════════════════════════════════
 *  PAGE DE VISIONNAGE
 *  Grille en deux colonnes (principale ≤ 1280 px + suggestions 402 px) à
 *  partir de 1015 px. Le lecteur reste au MÊME emplacement de l'arbre React
 *  quel que soit le mode : basculer en théâtre ne relance jamais la lecture.
 * ═══════════════════════════════════════════════════════════════════════════
 */
export function WatchLayout({
  videoId,
  initialVideo,
  startAtParam,
  playlistId,
}: WatchLayoutProps) {
  const router = useRouter();
  const { user } = useAuth();
  const { toast } = useToast();

  const playerRef = useRef<HTMLDivElement | null>(null);
  const { seekTo, getCurrentTime } = usePlayerBridge(playerRef);

  const {
    video,
    loading,
    setViewCount,
    setLike,
    subscribe,
    unsubscribe,
    setNotificationLevel,
  } = useWatchVideo({ videoId, initialVideo });

  // ── Mode théâtre (persisté par le lecteur dans localStorage) ─────────────
  const [theaterMode, setTheaterMode] = useState(false);
  useEffect(() => {
    setTheaterMode(readPlayerPreferences().theaterMode);
  }, []);

  // ── Lecture automatique ──────────────────────────────────────────────────
  const [autoplay, setAutoplay] = useState(true);
  useEffect(() => {
    if (user) setAutoplay(user.autoplay);
  }, [user]);

  const [countdownTarget, setCountdownTarget] = useState<VideoCardDTO | null>(null);
  useEffect(() => setCountdownTarget(null), [videoId]);

  // ── Enchaînement : playlist prioritaire, sinon première suggestion ───────
  const playlistQuery = usePlaylist(playlistId);
  const relatedQuery = useRelatedVideos(videoId);

  const nextVideo = useMemo<VideoCardDTO | null>(() => {
    const items = playlistQuery.data?.items ?? [];
    if (playlistId && items.length > 0) {
      const index = items.findIndex((item) => item.id === videoId);
      const next = index >= 0 ? items[index + 1] : items[0];
      if (next) return next;
    }
    const related = relatedQuery.data?.pages.flatMap((page) => page.items) ?? [];
    return related.find((item) => item.id !== videoId) ?? null;
  }, [playlistId, playlistQuery.data, relatedQuery.data, videoId]);

  const goToNext = useCallback(
    (target: VideoCardDTO) => {
      setCountdownTarget(null);
      router.push(PATHS.watch(target.id, { list: playlistId ?? undefined }));
    },
    [playlistId, router],
  );

  const handleEnded = useCallback(() => {
    if (!autoplay || !nextVideo) return;
    setCountdownTarget(nextVideo);
  }, [autoplay, nextVideo]);

  const handleNext = useCallback(() => {
    if (nextVideo) goToNext(nextVideo);
  }, [goToNext, nextVideo]);

  // ── Compteur de vues en temps réel ───────────────────────────────────────
  const onRealtimeViewCount = useCallback(
    (payload: unknown) => {
      if (typeof payload !== 'object' || payload === null) return;
      const data = payload as { videoId?: unknown; viewCount?: unknown };
      if (data.videoId !== videoId) return;
      if (typeof data.viewCount === 'number') setViewCount(data.viewCount);
    },
    [setViewCount, videoId],
  );

  useRealtimeEvent(WS_EVENTS.viewCount, onRealtimeViewCount, `video:${videoId}`);

  if (loading && !video) return <WatchSkeleton />;

  if (!video) {
    return (
      <EmptyState
        title="Vidéo indisponible"
        description="Cette vidéo n'a pas pu être chargée. Réessayez dans un instant."
      />
    );
  }

  // Reprise de lecture : `?t=` l'emporte sur la progression enregistrée.
  const startAt = startAtParam ?? video.viewer.watchedSec;
  const source: TrafficSource = playlistId ? 'PLAYLIST' : 'DIRECT';

  return (
    <div
      className={cn(
        'mx-auto grid w-full max-w-[1754px] grid-cols-1 gap-x-6 gap-y-4 px-4',
        // Réserve de bas de page + safe-area iOS (barre d'accueil).
        'pb-[calc(4rem+env(safe-area-inset-bottom))]',
        'min-[1015px]:grid-cols-[minmax(0,1fr)_402px]',
        // Sur mobile le lecteur est collé sous la barre : aucune marge haute.
        theaterMode ? 'pt-0' : 'pt-0 min-[1015px]:pt-4',
      )}
    >
      {/* ── Lecteur (position stable dans l'arbre) ─────────────────────── */}
      <div
        ref={playerRef}
        className={cn(
          '-mx-4 min-w-0 [&>div>div]:rounded-none min-[1015px]:row-start-1',
          theaterMode
            ? 'min-[1015px]:col-span-2 min-[1015px]:col-start-1'
            : cn(
                'sticky top-0 z-30 min-[1015px]:static min-[1015px]:mx-0',
                'min-[1015px]:col-start-1 min-[1015px]:max-w-[1280px]',
                'min-[1015px]:[&>div>div]:rounded-kt',
              ),
        )}
      >
        <div
          className={cn(
            'relative',
            // `dvh` : la hauteur utile change quand la barre d'URL mobile se replie.
            theaterMode && 'mx-auto max-w-[calc((100dvh-9rem)*16/9)]',
          )}
        >
          <VideoPlayer
            video={video}
            source={source}
            startAt={startAt}
            theaterMode={theaterMode}
            onTheaterToggle={() => setTheaterMode((current) => !current)}
            onEnded={handleEnded}
            onNext={nextVideo ? handleNext : undefined}
            onViewCountChange={setViewCount}
          />

          {countdownTarget ? (
            <AutoplayOverlay
              next={countdownTarget}
              onCancel={() => {
                setCountdownTarget(null);
                toast({ message: 'Lecture automatique annulée.' });
              }}
              onPlayNow={() => goToNext(countdownTarget)}
            />
          ) : null}
        </div>
      </div>

      {/* ── Colonne principale : infos + commentaires ──────────────────── */}
      <div className="flex min-w-0 flex-col gap-4 min-[1015px]:col-start-1 min-[1015px]:row-start-2 min-[1015px]:max-w-[1280px]">
        <VideoInfo
          video={video}
          viewCount={video.viewCount}
          playlistId={playlistId}
          playerRef={playerRef}
          onSeek={seekTo}
          getCurrentTime={getCurrentTime}
          onLike={setLike}
          onSubscribe={subscribe}
          onUnsubscribe={unsubscribe}
          onLevelChange={setNotificationLevel}
        />

        <CommentsSection video={video} onSeek={seekTo} className="mt-2" />
      </div>

      {/* ── Suggestions : à droite, ou sous les commentaires en théâtre ── */}
      <aside
        aria-label="Suggestions"
        className={cn(
          'flex min-w-0 flex-col gap-4',
          theaterMode
            ? 'min-[1015px]:col-start-1 min-[1015px]:row-start-3 min-[1015px]:max-w-[1280px]'
            : 'min-[1015px]:col-start-2 min-[1015px]:row-span-2 min-[1015px]:row-start-1 min-[1015px]:w-[402px]',
        )}
      >
        {playlistId ? (
          <PlaylistPanel
            playlistId={playlistId}
            currentVideoId={videoId}
            autoplay={autoplay}
            onAutoplayChange={setAutoplay}
          />
        ) : null}

        <RelatedVideos
          videoId={videoId}
          channelId={video.channel.id}
          playlistId={playlistId}
        />
      </aside>
    </div>
  );
}
