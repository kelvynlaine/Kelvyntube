'use client';

import Link from 'next/link';
import { useEffect, useRef, useState } from 'react';
import { formatDuration, type StudioVideoRowDTO } from '@kelvyntube/shared';
import { Checkbox, Tooltip, useToast } from '@kelvyntube/ui';
import { PATHS } from '@/lib/nav';
import { LikeRatio, StudioThumbnail } from './bits';
import { VideoProcessingStatus } from './VideoProcessingStatus';
import { type StudioVideoRowExtraDTO } from './studio-api';
import { formatNumber, formatRatioAsPercent, truncate } from './studio-format';
import {
  VideoActionsMenu,
  VisibilitySelect,
  useVideoPatch,
  videoDateInfo,
} from './video-row-actions';

export interface VideoTableRowProps {
  video: StudioVideoRowDTO & StudioVideoRowExtraDTO;
  channelId: string;
  selected: boolean;
  onToggleSelect: (videoId: string, selected: boolean) => void;
  onRequestDelete: (video: StudioVideoRowDTO) => void;
  /** Invalide la liste après une modification en ligne. */
  onChanged: () => void;
}

/**
 * Une ligne du tableau de gestion des vidéos — rendu DESKTOP uniquement.
 * Sous `feed-3` (900 px), `VideosScreen` bascule sur `VideoListCard` : un
 * tableau de 9 colonnes n'a aucun sens sur 390 px de large.
 */
export function VideoTableRow({
  video,
  channelId,
  selected,
  onToggleSelect,
  onRequestDelete,
  onChanged,
}: VideoTableRowProps) {
  const { toast } = useToast();
  const [editingTitle, setEditingTitle] = useState(false);
  const [titleDraft, setTitleDraft] = useState(video.title);
  const titleInputRef = useRef<HTMLInputElement | null>(null);

  useEffect(() => {
    setTitleDraft(video.title);
  }, [video.title]);

  useEffect(() => {
    if (editingTitle) titleInputRef.current?.select();
  }, [editingTitle]);

  const patchMutation = useVideoPatch(video.id, onChanged);

  const commitTitle = () => {
    const next = titleDraft.trim();
    setEditingTitle(false);
    if (!next || next === video.title) {
      setTitleDraft(video.title);
      return;
    }
    patchMutation.mutate({ title: next });
    toast({ message: 'Titre mis à jour.', variant: 'success' });
  };

  const editHref = PATHS.studioVideo(channelId, video.id);
  const date = videoDateInfo(video);

  return (
    <tr className="border-b border-border align-top transition-colors hover:bg-bg-hover/50">
      {/* ── Sélection ─────────────────────────────────────────────────── */}
      <td className="px-2 py-3">
        <Checkbox
          checked={selected}
          onChange={(event) => onToggleSelect(video.id, event.target.checked)}
          aria-label={`Sélectionner « ${video.title} »`}
        />
      </td>

      {/* ── Vidéo ─────────────────────────────────────────────────────── */}
      <th scope="row" className="max-w-0 px-2 py-3 text-left font-normal">
        <div className="flex gap-3">
          <Link
            href={editHref}
            aria-label={`Modifier « ${video.title} »`}
            className="relative shrink-0 rounded kt-focus-ring"
          >
            <StudioThumbnail url={video.thumbnailUrl} className="h-[68px] w-[120px]" />
            <span className="absolute bottom-1 right-1 rounded bg-black/80 px-1 text-kt-xs tabular-nums text-white">
              {formatDuration(video.durationSec)}
            </span>
          </Link>

          <div className="min-w-0 flex-1">
            {editingTitle ? (
              <input
                ref={titleInputRef}
                value={titleDraft}
                maxLength={120}
                aria-label="Titre de la vidéo"
                onChange={(event) => setTitleDraft(event.target.value)}
                onBlur={commitTitle}
                onKeyDown={(event) => {
                  if (event.key === 'Enter') {
                    event.preventDefault();
                    commitTitle();
                  } else if (event.key === 'Escape') {
                    event.preventDefault();
                    setTitleDraft(video.title);
                    setEditingTitle(false);
                  }
                }}
                className="w-full rounded-kt border border-accent-fg bg-bg px-2 py-1 text-kt-base text-fg focus:outline-none"
              />
            ) : (
              <Tooltip content="Double-cliquez pour renommer" side="top" delay={600}>
                <span
                  role="button"
                  tabIndex={0}
                  onDoubleClick={() => setEditingTitle(true)}
                  onKeyDown={(event) => {
                    if (event.key === 'Enter' || event.key === ' ') {
                      event.preventDefault();
                      setEditingTitle(true);
                    }
                  }}
                  className="kt-clamp-2 cursor-text rounded text-kt-base font-medium text-fg kt-focus-ring"
                >
                  {video.title}
                </span>
              </Tooltip>
            )}

            {video.description ? (
              <p className="kt-clamp-1 mt-0.5 text-kt-sm text-fg-subtle">
                {truncate(video.description, 120)}
              </p>
            ) : null}

            <div className="mt-1.5">
              <VideoProcessingStatus
                videoId={video.id}
                status={video.status}
                progress={video.processingProgress}
                error={video.processingError}
              />
            </div>
          </div>
        </div>
      </th>

      {/* ── Visibilité ────────────────────────────────────────────────── */}
      <td className="px-2 py-3">
        <VisibilitySelect
          video={video}
          disabled={patchMutation.isPending}
          onChange={(visibility) => patchMutation.mutate({ visibility })}
          containerClassName="w-40"
        />
      </td>

      {/* ── Métriques ─────────────────────────────────────────────────── */}
      <td className="whitespace-nowrap px-2 py-3 text-kt-sm text-fg-muted">
        <span className="block text-fg">{date.label}</span>
        <span className="block text-fg-subtle">{date.hint}</span>
      </td>
      <td className="px-2 py-3 text-right tabular-nums text-fg">
        {formatNumber(video.viewCount)}
      </td>
      <td className="px-2 py-3 text-right tabular-nums text-fg">
        {formatNumber(video.commentCount)}
      </td>
      <td className="px-2 py-3">
        <LikeRatio likeCount={video.likeCount} dislikeCount={video.dislikeCount} />
      </td>
      <td className="px-2 py-3 text-right tabular-nums text-fg">
        {formatRatioAsPercent(video.ctr)}
      </td>
      <td className="px-2 py-3 text-right tabular-nums text-fg">
        {formatRatioAsPercent(video.avgWatchPct)}
      </td>

      {/* ── Actions ───────────────────────────────────────────────────── */}
      <td className="px-2 py-3">
        <VideoActionsMenu
          video={video}
          channelId={channelId}
          onRequestDelete={onRequestDelete}
        />
      </td>
    </tr>
  );
}
