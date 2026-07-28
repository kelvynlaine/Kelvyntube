'use client';

import { Clock, ListVideo, ThumbsUp } from 'lucide-react';
import type { ReactNode } from 'react';
import type { PlaylistKind, VideoVisibility } from '@kelvyntube/shared';
import type { SelectOption } from '@kelvyntube/ui';

/**
 * Libellés et icônes partagés par toutes les vues de playlists.
 */

export const VISIBILITY_LABELS: Record<VideoVisibility, string> = {
  PUBLIC: 'Publique',
  UNLISTED: 'Non répertoriée',
  PRIVATE: 'Privée',
  SCHEDULED: 'Programmée',
};

/** Visibilités proposées à la création / édition d'une playlist. */
export const VISIBILITY_OPTIONS: SelectOption[] = [
  { value: 'PUBLIC', label: VISIBILITY_LABELS.PUBLIC },
  { value: 'UNLISTED', label: VISIBILITY_LABELS.UNLISTED },
  { value: 'PRIVATE', label: VISIBILITY_LABELS.PRIVATE },
];

/** Une playlist système ne peut être ni supprimée ni renommée. */
export function isSystemPlaylist(kind: PlaylistKind): boolean {
  return kind !== 'USER';
}

/** Icône dédiée aux playlists système (horloge, pouce levé). */
export function playlistIcon(kind: PlaylistKind, size = 20): ReactNode {
  if (kind === 'WATCH_LATER') return <Clock size={size} aria-hidden="true" />;
  if (kind === 'LIKED') return <ThumbsUp size={size} aria-hidden="true" />;
  return <ListVideo size={size} aria-hidden="true" />;
}

/** « 12 vidéos » / « 1 vidéo » / « Aucune vidéo ». */
export function formatItemCount(count: number): string {
  if (count <= 0) return 'Aucune vidéo';
  return `${count} vidéo${count > 1 ? 's' : ''}`;
}
