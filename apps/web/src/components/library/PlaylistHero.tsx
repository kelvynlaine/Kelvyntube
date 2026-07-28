'use client';

import Link from 'next/link';
import { ListVideo, Play, Shuffle } from 'lucide-react';
import type { ReactNode } from 'react';
import type { PlaylistKind, VideoVisibility } from '@kelvyntube/shared';
import { Button, cn } from '@kelvyntube/ui';
import { formatItemCount, playlistIcon, VISIBILITY_LABELS } from './playlist-utils';

export interface PlaylistHeroProps {
  title: string;
  description?: string | null;
  kind: PlaylistKind;
  visibility: VideoVisibility;
  itemCount: number;
  /** Miniature de la première vidéo : sert aussi de fond dégradé. */
  thumbnailUrl: string | null;
  ownerName?: string | null;
  /** Destination du bouton « Tout lire » (null si la playlist est vide). */
  playAllHref: string | null;
  /** Choisit une vidéo au hasard puis navigue (destination inconnue au rendu). */
  onShuffle?: () => void;
  /** Actions propriétaire (menu ⋮, bouton d'édition…). */
  actions?: ReactNode;
  /** Formulaire d'édition en ligne, rendu à la place du titre et du descriptif. */
  editing?: ReactNode;
}

/**
 * Panneau latéral gauche des pages de type playlist : fond dégradé dérivé de
 * la miniature, titre, compteur, boutons « Tout lire » et « Aléatoire ».
 * Il devient collant à partir de `lg` (mise en page à deux colonnes).
 */
export function PlaylistHero({
  title,
  description,
  kind,
  visibility,
  itemCount,
  thumbnailUrl,
  ownerName,
  playAllHref,
  onShuffle,
  actions,
  editing,
}: PlaylistHeroProps) {
  return (
    <aside
      className={cn(
        'relative w-full shrink-0 overflow-hidden rounded-kt-lg border border-border p-5',
        // `top-[72px]` = hauteur de la barre supérieure fixe (56 px) + marge
        'lg:sticky lg:top-[72px] lg:w-[360px] lg:self-start',
      )}
    >
      {/* Fond dérivé de la miniature : image floutée + voile dégradé */}
      {thumbnailUrl ? (
        <span
          aria-hidden="true"
          style={{ backgroundImage: `url(${thumbnailUrl})` }}
          className="absolute inset-0 scale-125 bg-cover bg-center opacity-40 blur-2xl"
        />
      ) : null}
      <span
        aria-hidden="true"
        className="absolute inset-0 bg-gradient-to-b from-bg/40 via-bg/80 to-bg"
      />

      <div className="relative flex flex-col gap-4">
        <span className="block aspect-video w-full overflow-hidden rounded-kt bg-bg-elevated">
          {thumbnailUrl ? (
            <img
              src={thumbnailUrl}
              alt=""
              loading="lazy"
              decoding="async"
              className="size-full object-cover"
            />
          ) : (
            <span className="flex size-full items-center justify-center text-fg-subtle">
              <ListVideo size={40} aria-hidden="true" />
            </span>
          )}
        </span>

        {editing ?? (
          <div className="flex flex-col gap-2">
            <div className="flex items-start justify-between gap-2">
              <h1 className="flex min-w-0 items-center gap-2 text-kt-xl font-medium text-fg">
                <span className="text-fg-muted">{playlistIcon(kind, 22)}</span>
                <span className="min-w-0 break-words">{title}</span>
              </h1>
              {actions}
            </div>

            {ownerName ? (
              <p className="text-kt-base font-medium text-fg">{ownerName}</p>
            ) : null}

            <p className="flex flex-wrap items-center gap-x-1 text-kt-sm text-fg-muted">
              <span>{formatItemCount(itemCount)}</span>
              <span aria-hidden="true">•</span>
              <span>{VISIBILITY_LABELS[visibility]}</span>
            </p>

            {description ? (
              <p className="kt-clamp-3 whitespace-pre-line text-kt-base text-fg-muted">
                {description}
              </p>
            ) : null}
          </div>
        )}

        <div className="flex flex-wrap items-center gap-2">
          {playAllHref ? (
            <Link
              href={playAllHref}
              className="kt-btn-primary h-9 px-4 text-kt-base"
            >
              <Play size={18} aria-hidden="true" />
              Tout lire
            </Link>
          ) : (
            <Button variant="primary" disabled iconLeft={<Play size={18} />}>
              Tout lire
            </Button>
          )}

          <Button
            variant="secondary"
            onClick={onShuffle}
            disabled={!onShuffle || itemCount === 0}
            iconLeft={<Shuffle size={18} aria-hidden="true" />}
          >
            Aléatoire
          </Button>
        </div>
      </div>
    </aside>
  );
}

/** Conteneur deux colonnes : panneau latéral + liste numérotée. */
export function PlaylistLayout({
  hero,
  children,
}: {
  hero: ReactNode;
  children: ReactNode;
}) {
  return (
    <div className="flex flex-col gap-6 lg:flex-row lg:items-start">
      {hero}
      <div className="min-w-0 flex-1">{children}</div>
    </div>
  );
}
