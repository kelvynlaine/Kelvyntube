'use client';

import { useEffect, useMemo, useRef } from 'react';
import Link from 'next/link';
import { useQuery } from '@tanstack/react-query';
import { ListVideo, Play } from 'lucide-react';
import { Skeleton, Switch } from '@kelvyntube/ui';
import {
  ROUTES,
  formatDuration,
  type PlaylistDetailDTO,
} from '@kelvyntube/shared';
import { api } from '@/lib/api';
import { PATHS } from '@/lib/nav';

/** Playlist en cours de lecture (partagée avec la lecture automatique). */
export function usePlaylist(playlistId: string | null) {
  return useQuery<PlaylistDetailDTO>({
    queryKey: ['playlist', playlistId],
    enabled: Boolean(playlistId),
    queryFn: () =>
      api.get<PlaylistDetailDTO>(ROUTES.playlists.byId(playlistId as string), {
        allowAnonymous: true,
      }),
  });
}

export interface PlaylistPanelProps {
  playlistId: string;
  /** Vidéo actuellement lue. */
  currentVideoId: string;
  autoplay: boolean;
  onAutoplayChange: (value: boolean) => void;
  className?: string;
}

/** Panneau de playlist affiché en tête de la colonne de suggestions. */
export function PlaylistPanel({
  playlistId,
  currentVideoId,
  autoplay,
  onAutoplayChange,
  className,
}: PlaylistPanelProps) {
  const { data, isPending, isError } = usePlaylist(playlistId);
  const listRef = useRef<HTMLOListElement | null>(null);

  const currentIndex = useMemo(
    () => data?.items.findIndex((item) => item.id === currentVideoId) ?? -1,
    [currentVideoId, data],
  );

  // Amène l'élément courant dans le champ de vision du panneau.
  useEffect(() => {
    const list = listRef.current;
    if (!list || currentIndex < 0) return;
    const target = list.querySelector<HTMLElement>('[data-current="true"]');
    target?.scrollIntoView({ block: 'nearest' });
  }, [currentIndex]);

  if (isError) return null;

  return (
    <section
      aria-labelledby="titre-playlist"
      className={`overflow-hidden rounded-kt border border-border bg-bg-elevated ${className ?? ''}`}
    >
      <header className="flex flex-col gap-2 border-b border-border p-3">
        {isPending ? (
          <>
            <Skeleton variant="text" className="h-4 w-2/3" />
            <Skeleton variant="text" className="h-3 w-1/3" />
          </>
        ) : (
          <>
            <h2
              id="titre-playlist"
              className="kt-clamp-2 text-kt-md font-medium text-fg"
            >
              {data?.title}
            </h2>
            <p className="flex items-center gap-2 text-kt-sm text-fg-muted">
              <ListVideo size={14} aria-hidden="true" />
              <span>{data?.owner?.name ?? 'Playlist'}</span>
              <span aria-hidden="true">·</span>
              <span className="tabular-nums">
                {currentIndex >= 0 ? currentIndex + 1 : 1} / {data?.itemCount ?? 0}
              </span>
            </p>
          </>
        )}

        <Switch
          checked={autoplay}
          onCheckedChange={onAutoplayChange}
          label="Lecture automatique"
          description="Enchaîner la vidéo suivante de la playlist"
        />
      </header>

      <ol
        ref={listRef}
        className="kt-scroll max-h-[420px] overflow-y-auto"
        aria-label="Vidéos de la playlist"
      >
        {isPending
          ? Array.from({ length: 4 }).map((_, index) => (
              <li key={index} className="flex gap-2 p-2">
                <Skeleton className="h-[54px] w-24 shrink-0 rounded" />
                <div className="flex flex-1 flex-col gap-2">
                  <Skeleton variant="text" className="h-3 w-full" />
                  <Skeleton variant="text" className="h-3 w-1/2" />
                </div>
              </li>
            ))
          : data?.items.map((item, index) => {
              const current = item.id === currentVideoId;
              return (
                <li key={item.id} data-current={current ? 'true' : undefined}>
                  <Link
                    href={PATHS.watch(item.id, { list: playlistId })}
                    aria-current={current ? 'true' : undefined}
                    className={`flex items-center gap-2 p-2 transition-colors hover:bg-bg-hover kt-focus-ring ${
                      current ? 'bg-bg-active' : ''
                    }`}
                  >
                    <span className="flex w-5 shrink-0 justify-center text-kt-sm tabular-nums text-fg-muted">
                      {current ? (
                        <Play size={12} aria-label="En cours de lecture" />
                      ) : (
                        index + 1
                      )}
                    </span>

                    <span className="relative block h-[54px] w-24 shrink-0 overflow-hidden rounded bg-bg">
                      {item.thumbnailUrl ? (
                        <img
                          src={item.thumbnailUrl}
                          alt=""
                          loading="lazy"
                          decoding="async"
                          className="size-full object-cover"
                        />
                      ) : null}
                      {item.durationSec > 0 ? (
                        <span className="absolute bottom-1 right-1 rounded bg-black/80 px-1 text-kt-xs font-medium tabular-nums text-white">
                          {formatDuration(item.durationSec)}
                        </span>
                      ) : null}
                    </span>

                    <span className="flex min-w-0 flex-col">
                      <span className="kt-clamp-2 text-kt-sm font-medium text-fg">
                        {item.title}
                      </span>
                      <span className="truncate text-kt-xs text-fg-muted">
                        {item.channel.name}
                      </span>
                    </span>
                  </Link>
                </li>
              );
            })}
      </ol>
    </section>
  );
}
