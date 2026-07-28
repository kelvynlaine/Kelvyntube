'use client';

import Link from 'next/link';
import type { ReactNode } from 'react';
import { Eye, MessageSquare, MousePointerClick, ThumbsUp, Timer } from 'lucide-react';
import { formatDuration, type StudioVideoRowDTO } from '@kelvyntube/shared';
import { Checkbox, cn } from '@kelvyntube/ui';
import { PATHS } from '@/lib/nav';
import { StudioThumbnail } from './bits';
import { VideoProcessingStatus } from './VideoProcessingStatus';
import { type StudioVideoRowExtraDTO } from './studio-api';
import { formatNumber, formatRatioAsPercent, truncate } from './studio-format';
import {
  VideoActionsMenu,
  VisibilitySelect,
  useVideoPatch,
  videoDateInfo,
} from './video-row-actions';

/**
 * ═══════════════════════════════════════════════════════════════════════════
 *  CARTE VIDÉO — rendu MOBILE de l'écran Contenu (sous feed-3 / 900 px)
 *
 *  Pourquoi une carte plutôt que le tableau ?
 *  Le tableau de gestion compte 9 colonnes et impose `min-w-[68rem]`
 *  (1088 px). Sur 390 px, cela veut dire un scroll horizontal permanent où
 *  l'on ne voit jamais plus d'une colonne et demie : inutilisable.
 *
 *  La carte reprend exactement les mêmes données, hiérarchisées :
 *   • miniature + titre + état de traitement (ce qu'on cherche du regard) ;
 *   • visibilité, modifiable sur place, et date ;
 *   • les métriques en une ligne compacte qui passe à la ligne au besoin ;
 *   • tout le reste (modifier, voir, analytics, télécharger, supprimer) dans
 *     le menu « ⋯ », strictement le même qu'en desktop.
 *
 *  Le renommage par double-clic reste une affordance desktop : sur mobile on
 *  passe par « Modifier », d'où l'absence d'édition en ligne du titre ici.
 * ═══════════════════════════════════════════════════════════════════════════
 */

export interface VideoListCardProps {
  video: StudioVideoRowDTO & StudioVideoRowExtraDTO;
  channelId: string;
  selected: boolean;
  onToggleSelect: (videoId: string, selected: boolean) => void;
  onRequestDelete: (video: StudioVideoRowDTO) => void;
  onChanged: () => void;
}

/** Une métrique compacte de la carte (icône + valeur + libellé lisible). */
function Metric({
  icon,
  value,
  label,
}: {
  icon: ReactNode;
  value: string;
  label: string;
}) {
  return (
    <span className="inline-flex items-center gap-1.5 text-kt-sm">
      <span aria-hidden="true" className="text-fg-subtle">
        {icon}
      </span>
      <span className="tabular-nums text-fg">{value}</span>
      <span className="text-fg-subtle">{label}</span>
    </span>
  );
}

export function VideoListCard({
  video,
  channelId,
  selected,
  onToggleSelect,
  onRequestDelete,
  onChanged,
}: VideoListCardProps) {
  const patchMutation = useVideoPatch(video.id, onChanged);
  const editHref = PATHS.studioVideo(channelId, video.id);
  const date = videoDateInfo(video);

  return (
    <li
      className={cn(
        'flex flex-col gap-3 rounded-kt border p-3 transition-colors',
        selected ? 'border-border-strong bg-bg-hover' : 'border-border bg-bg-elevated',
      )}
    >
      <div className="flex gap-3">
        {/*
          Le carré visible de la case ne fait que 18 px. On l'inscrit dans un
          `<label>` de 44×44 : cliquer n'importe où dans ce carré coche la
          vidéo, sans toucher au rendu de la case elle-même.
        */}
        <label className="-ml-1 flex size-11 shrink-0 cursor-pointer items-center justify-center">
          <Checkbox
            checked={selected}
            onChange={(event) => onToggleSelect(video.id, event.target.checked)}
            aria-label={`Sélectionner « ${video.title} »`}
          />
        </label>

        <Link
          href={editHref}
          aria-label={`Modifier « ${video.title} »`}
          className="relative shrink-0 rounded kt-focus-ring"
        >
          <StudioThumbnail url={video.thumbnailUrl} className="h-[63px] w-[112px]" />
          <span className="absolute bottom-1 right-1 rounded bg-black/80 px-1 text-kt-xs tabular-nums text-white">
            {formatDuration(video.durationSec)}
          </span>
        </Link>

        <div className="min-w-0 flex-1">
          <Link
            href={editHref}
            className="kt-clamp-2 text-kt-base font-medium text-fg kt-focus-ring"
          >
            {video.title}
          </Link>
          {video.description ? (
            <p className="kt-clamp-1 mt-0.5 text-kt-sm text-fg-subtle">
              {truncate(video.description, 80)}
            </p>
          ) : null}
        </div>
      </div>

      <VideoProcessingStatus
        videoId={video.id}
        status={video.status}
        progress={video.processingProgress}
        error={video.processingError}
        compact
      />

      {/* ── Métriques clés, en ligne ──────────────────────────────────── */}
      <div className="flex flex-wrap items-center gap-x-4 gap-y-1.5">
        <Metric icon={<Eye size={14} />} value={formatNumber(video.viewCount)} label="vues" />
        <Metric
          icon={<ThumbsUp size={14} />}
          value={formatNumber(video.likeCount)}
          label="j'aime"
        />
        <Metric
          icon={<MessageSquare size={14} />}
          value={formatNumber(video.commentCount)}
          label="commentaires"
        />
        <Metric
          icon={<MousePointerClick size={14} />}
          value={formatRatioAsPercent(video.ctr)}
          label="CTR"
        />
        <Metric
          icon={<Timer size={14} />}
          value={formatRatioAsPercent(video.avgWatchPct)}
          label="rétention"
        />
      </div>

      {/* ── Visibilité + date + menu ──────────────────────────────────── */}
      <div className="flex items-end gap-2 border-t border-border pt-3">
        <div className="min-w-0 flex-1">
          <VisibilitySelect
            video={video}
            disabled={patchMutation.isPending}
            onChange={(visibility) => patchMutation.mutate({ visibility })}
            // 44 px de haut : le `sm` du design system n'en fait que 32.
            className="h-11 text-kt-base"
            containerClassName="w-full max-w-[12rem]"
          />
        </div>

        <p className="min-w-0 flex-1 text-right text-kt-sm text-fg-muted">
          <span className="block truncate text-fg">{date.label}</span>
          <span className="block truncate text-fg-subtle">{date.hint}</span>
        </p>

        <VideoActionsMenu
          video={video}
          channelId={channelId}
          onRequestDelete={onRequestDelete}
          triggerClassName="size-11 shrink-0 text-fg hover:bg-bg-hover"
        />
      </div>
    </li>
  );
}
