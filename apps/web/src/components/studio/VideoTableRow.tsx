'use client';

import Link from 'next/link';
import { useRouter } from 'next/navigation';
import { useEffect, useRef, useState } from 'react';
import { useMutation, useQueryClient } from '@tanstack/react-query';
import { BarChart3, Download, ExternalLink, MoreVertical, Pencil, Trash2 } from 'lucide-react';
import {
  ROUTES,
  formatDuration,
  type StudioVideoRowDTO,
  type VideoDetailDTO,
  type VideoVisibility,
} from '@kelvyntube/shared';
import { Badge, Checkbox, DropdownMenu, Select, Tooltip, useToast } from '@kelvyntube/ui';
import { api } from '@/lib/api';
import { PATHS } from '@/lib/nav';
import { LikeRatio, StudioThumbnail } from './bits';
import { VideoProcessingStatus } from './VideoProcessingStatus';
import { VISIBILITY_LABELS, type StudioVideoRowExtraDTO } from './studio-api';
import {
  formatDateTime,
  formatNumber,
  formatRatioAsPercent,
  formatShortDate,
  truncate,
} from './studio-format';

/**
 * « Programmée » est présente mais désactivée : le passage en programmé exige
 * une date, donc il se fait depuis la page de détail, pas depuis le tableau.
 */
const VISIBILITY_OPTIONS = [
  ...(['PUBLIC', 'UNLISTED', 'PRIVATE'] as const).map((value) => ({
    value,
    label: VISIBILITY_LABELS[value],
  })),
  { value: 'SCHEDULED', label: VISIBILITY_LABELS.SCHEDULED, disabled: true },
];

export interface VideoTableRowProps {
  video: StudioVideoRowDTO & StudioVideoRowExtraDTO;
  channelId: string;
  selected: boolean;
  onToggleSelect: (videoId: string, selected: boolean) => void;
  onRequestDelete: (video: StudioVideoRowDTO) => void;
  /** Invalide la liste après une modification en ligne. */
  onChanged: () => void;
}

/** Une ligne du tableau de gestion des vidéos. */
export function VideoTableRow({
  video,
  channelId,
  selected,
  onToggleSelect,
  onRequestDelete,
  onChanged,
}: VideoTableRowProps) {
  const { toast } = useToast();
  const router = useRouter();
  const queryClient = useQueryClient();
  const [editingTitle, setEditingTitle] = useState(false);
  const [titleDraft, setTitleDraft] = useState(video.title);
  const titleInputRef = useRef<HTMLInputElement | null>(null);

  useEffect(() => {
    setTitleDraft(video.title);
  }, [video.title]);

  useEffect(() => {
    if (editingTitle) titleInputRef.current?.select();
  }, [editingTitle]);

  const patchMutation = useMutation({
    mutationFn: (body: { title?: string; visibility?: VideoVisibility }) =>
      api.patch<VideoDetailDTO>(ROUTES.videos.update(video.id), body),
    onSuccess: () => {
      void queryClient.invalidateQueries({ queryKey: ['studio'] });
      onChanged();
    },
    onError: (error: Error) => toast({ message: error.message, variant: 'error' }),
  });

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

  /** Téléchargement : l'URL du fichier n'est pas dans la ligne, on va la chercher. */
  const download = async () => {
    try {
      const detail = await api.get<VideoDetailDTO>(ROUTES.videos.byId(video.id));
      const url = detail.mp4FallbackUrl ?? detail.hlsMasterUrl;
      if (!url) {
        toast({
          message: 'Aucun fichier téléchargeable : la vidéo est encore en traitement.',
          variant: 'info',
        });
        return;
      }
      window.open(url, '_blank', 'noopener,noreferrer');
    } catch {
      toast({ message: 'Téléchargement impossible pour le moment.', variant: 'error' });
    }
  };

  const editHref = PATHS.studioVideo(channelId, video.id);
  const dateLabel = video.publishedAt
    ? formatShortDate(video.publishedAt)
    : video.publishAt
      ? formatDateTime(video.publishAt)
      : formatShortDate(video.createdAt);
  const dateHint = video.publishedAt
    ? 'Publiée'
    : video.publishAt
      ? 'Publication prévue'
      : 'Créée';

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
        <Select
          selectSize="sm"
          value={video.visibility}
          disabled={patchMutation.isPending || video.status !== 'READY'}
          aria-label={`Visibilité de « ${video.title} »`}
          options={VISIBILITY_OPTIONS}
          onChange={(event) =>
            patchMutation.mutate({ visibility: event.target.value as VideoVisibility })
          }
          containerClassName="w-40"
        />
        {video.visibility === 'SCHEDULED' && video.publishAt ? (
          <Badge className="mt-1.5" variant="new">
            Programmée · {formatDateTime(video.publishAt)}
          </Badge>
        ) : null}
      </td>

      {/* ── Métriques ─────────────────────────────────────────────────── */}
      <td className="whitespace-nowrap px-2 py-3 text-kt-sm text-fg-muted">
        <span className="block text-fg">{dateLabel}</span>
        <span className="block text-fg-subtle">{dateHint}</span>
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
        <DropdownMenu
          align="end"
          label={`Actions pour « ${video.title} »`}
          triggerLabel={`Actions pour « ${video.title} »`}
          triggerClassName="size-9 text-fg hover:bg-bg-hover"
          trigger={<MoreVertical size={18} aria-hidden="true" />}
          items={[
            {
              id: 'edit',
              label: 'Modifier',
              icon: <Pencil size={16} aria-hidden="true" />,
              onSelect: () => router.push(editHref),
            },
            {
              id: 'watch',
              label: 'Voir sur Kelvyn Tube',
              icon: <ExternalLink size={16} aria-hidden="true" />,
              disabled: video.status !== 'READY',
              onSelect: () => window.open(PATHS.watch(video.id), '_blank', 'noopener,noreferrer'),
            },
            {
              id: 'analytics',
              label: 'Analytics',
              icon: <BarChart3 size={16} aria-hidden="true" />,
              onSelect: () => router.push(`${editHref}?tab=analytics`),
            },
            {
              id: 'download',
              label: 'Télécharger',
              icon: <Download size={16} aria-hidden="true" />,
              onSelect: () => void download(),
            },
            { id: 'sep', separator: true },
            {
              id: 'delete',
              label: 'Supprimer définitivement',
              icon: <Trash2 size={16} aria-hidden="true" />,
              danger: true,
              onSelect: () => onRequestDelete(video),
            },
          ]}
        />
      </td>
    </tr>
  );
}
