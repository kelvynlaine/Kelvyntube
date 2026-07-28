'use client';

import { useRouter } from 'next/navigation';
import { useMutation, useQueryClient } from '@tanstack/react-query';
import { BarChart3, Download, ExternalLink, MoreVertical, Pencil, Trash2 } from 'lucide-react';
import {
  ROUTES,
  type StudioVideoRowDTO,
  type VideoDetailDTO,
  type VideoVisibility,
} from '@kelvyntube/shared';
import { Badge, DropdownMenu, Select, useToast } from '@kelvyntube/ui';
import { api } from '@/lib/api';
import { PATHS } from '@/lib/nav';
import { VISIBILITY_LABELS } from './studio-api';
import { formatDateTime, formatShortDate } from './studio-format';

/**
 * ═══════════════════════════════════════════════════════════════════════════
 *  ACTIONS D'UNE VIDÉO — briques partagées
 *
 *  L'écran Contenu a désormais DEUX rendus (tableau en desktop, cartes en
 *  mobile). Le menu « ⋯ » et le sélecteur de visibilité sont identiques dans
 *  les deux : ils vivent ici pour rester rigoureusement synchronisés.
 * ═══════════════════════════════════════════════════════════════════════════
 */

/**
 * « Programmée » est présente mais désactivée : le passage en programmé exige
 * une date, donc il se fait depuis la page de détail, pas depuis la liste.
 */
const VISIBILITY_OPTIONS = [
  ...(['PUBLIC', 'UNLISTED', 'PRIVATE'] as const).map((value) => ({
    value,
    label: VISIBILITY_LABELS[value],
  })),
  { value: 'SCHEDULED', label: VISIBILITY_LABELS.SCHEDULED, disabled: true },
];

/** Mutation de mise à jour en ligne (titre / visibilité) d'une vidéo. */
export function useVideoPatch(videoId: string, onChanged: () => void) {
  const { toast } = useToast();
  const queryClient = useQueryClient();

  return useMutation({
    mutationFn: (body: { title?: string; visibility?: VideoVisibility }) =>
      api.patch<VideoDetailDTO>(ROUTES.videos.update(videoId), body),
    onSuccess: () => {
      void queryClient.invalidateQueries({ queryKey: ['studio'] });
      onChanged();
    },
    onError: (error: Error) => toast({ message: error.message, variant: 'error' }),
  });
}

/** Sélecteur de visibilité en ligne, partagé par le tableau et les cartes. */
export function VisibilitySelect({
  video,
  disabled,
  onChange,
  className,
  containerClassName,
}: {
  video: StudioVideoRowDTO;
  disabled: boolean;
  onChange: (visibility: VideoVisibility) => void;
  className?: string;
  containerClassName?: string;
}) {
  return (
    <>
      <Select
        selectSize="sm"
        value={video.visibility}
        disabled={disabled || video.status !== 'READY'}
        aria-label={`Visibilité de « ${video.title} »`}
        options={VISIBILITY_OPTIONS}
        onChange={(event) => onChange(event.target.value as VideoVisibility)}
        className={className}
        containerClassName={containerClassName}
      />
      {video.visibility === 'SCHEDULED' && video.publishAt ? (
        <Badge className="mt-1.5" variant="new">
          Programmée · {formatDateTime(video.publishAt)}
        </Badge>
      ) : null}
    </>
  );
}

/** Menu « ⋯ » d'une vidéo (modifier, voir, analytics, télécharger, supprimer). */
export function VideoActionsMenu({
  video,
  channelId,
  onRequestDelete,
  triggerClassName,
}: {
  video: StudioVideoRowDTO;
  channelId: string;
  onRequestDelete: (video: StudioVideoRowDTO) => void;
  triggerClassName?: string;
}) {
  const router = useRouter();
  const { toast } = useToast();
  const editHref = PATHS.studioVideo(channelId, video.id);

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

  return (
    <DropdownMenu
      align="end"
      label={`Actions pour « ${video.title} »`}
      triggerLabel={`Actions pour « ${video.title} »`}
      triggerClassName={triggerClassName ?? 'size-9 text-fg hover:bg-bg-hover'}
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
  );
}

/** Libellé de date d'une ligne : publiée / programmée / créée. */
export function videoDateInfo(video: StudioVideoRowDTO): { label: string; hint: string } {
  if (video.publishedAt) {
    return { label: formatShortDate(video.publishedAt), hint: 'Publiée' };
  }
  if (video.publishAt) {
    return { label: formatDateTime(video.publishAt), hint: 'Publication prévue' };
  }
  return { label: formatShortDate(video.createdAt), hint: 'Créée' };
}
