'use client';

import { useMemo, type RefObject } from 'react';
import Link from 'next/link';
import { HashtagList } from '@kelvyntube/ui';
import {
  extractHashtags,
  type LikeState,
  type NotificationLevel,
  type VideoDetailDTO,
} from '@kelvyntube/shared';
import { PATHS } from '@/lib/nav';
import { ChannelRow } from './ChannelRow';
import { ChapterList } from './ChapterList';
import { VideoActions } from './VideoActions';
import { VideoDescription } from './VideoDescription';

export interface VideoInfoProps {
  video: VideoDetailDTO;
  viewCount: number;
  playlistId: string | null;
  playerRef: RefObject<HTMLDivElement | null>;
  onSeek: (seconds: number) => void;
  getCurrentTime: () => number;
  onLike: (direction: Exclude<LikeState, 'NONE'>) => Promise<void>;
  onSubscribe: (level?: NotificationLevel) => Promise<void>;
  onUnsubscribe: () => Promise<void>;
  onLevelChange: (level: NotificationLevel) => Promise<void>;
}

const MAX_HASHTAGS = 3;

/** Hashtags, titre, ligne chaîne + actions, description et chapitres. */
export function VideoInfo({
  video,
  viewCount,
  playlistId,
  playerRef,
  onSeek,
  getCurrentTime,
  onLike,
  onSubscribe,
  onUnsubscribe,
  onLevelChange,
}: VideoInfoProps) {
  /** Tags de la vidéo, complétés par ceux présents dans la description. */
  const hashtags = useMemo(() => {
    const fromTags = video.tags.map((tag) => tag.name);
    if (fromTags.length > 0) return fromTags;
    return extractHashtags(video.description ?? '');
  }, [video.description, video.tags]);

  return (
    <section aria-labelledby="titre-video" className="flex flex-col gap-3">
      <HashtagList
        tags={hashtags}
        max={MAX_HASHTAGS}
        hrefFor={(tag) => PATHS.hashtag(tag)}
        linkComponent={Link}
        className="text-kt-base"
      />

      <h1
        id="titre-video"
        className="kt-clamp-2 text-kt-lg font-semibold text-fg"
        title={video.title}
      >
        {video.title}
      </h1>

      <div className="flex flex-col gap-3 min-[1015px]:flex-row min-[1015px]:items-center min-[1015px]:justify-between">
        <ChannelRow
          video={video}
          onSubscribe={onSubscribe}
          onUnsubscribe={onUnsubscribe}
          onLevelChange={onLevelChange}
        />
        <VideoActions
          video={video}
          getCurrentTime={getCurrentTime}
          onLike={onLike}
          playlistId={playlistId}
        />
      </div>

      <VideoDescription video={video} viewCount={viewCount} onSeek={onSeek} />

      {video.chapters.length > 0 ? (
        <ChapterList
          chapters={video.chapters}
          thumbnailUrl={video.thumbnailUrl}
          durationSec={video.durationSec}
          onSeek={onSeek}
          playerRef={playerRef}
        />
      ) : null}
    </section>
  );
}
