'use client';

import type { VideoCardDTO } from '@kelvyntube/shared';
import { formatDuration, formatRelativeTime, formatViews } from '@kelvyntube/shared';
import { Ban, Clock, ListVideo, MoreVertical, Save, Share2 } from 'lucide-react';
import { useCallback, useEffect, useMemo, useRef, useState } from 'react';
import { cn } from '../cn';
import { useImpression } from '../hooks/useImpression';
import {
  useIsTouchDevice,
  usePrefersReducedMotion,
} from '../hooks/useMediaPreferences';
import { resolveLinkComponent, type LinkComponent } from '../types';
import { Avatar } from './Avatar';
import { Badge } from './Badge';
import { DropdownMenu, type DropdownMenuItem } from './DropdownMenu';
import { IconButton } from './IconButton';
import { VerifiedBadge } from './VerifiedBadge';

export type VideoCardLayout = 'grid' | 'list' | 'compact';

/** Actions du menu « ⋮ » standard. */
export type VideoMenuAction =
  | 'queue'
  | 'watch-later'
  | 'save'
  | 'share'
  | 'not-interested';

export interface VideoCardProps {
  video: VideoCardDTO;
  /** `grid` (feed), `list` (recherche), `compact` (sidebar de visionnage). */
  layout?: VideoCardLayout;
  /** Affiche l'avatar et le nom de la chaîne (vrai par défaut sauf en `compact`). */
  showChannel?: boolean;
  /** Appelé UNE SEULE FOIS quand la carte devient visible à 50 % (CTR). */
  onImpression?: (id: string) => void;
  /** Remplace entièrement les entrées du menu « ⋮ ». */
  menuItems?: DropdownMenuItem[];
  /** Callback des entrées standard du menu (ignoré si `menuItems` est fourni). */
  onMenuAction?: (action: VideoMenuAction, videoId: string) => void;
  /** URL de visionnage (par défaut `/watch?v=<id>`). */
  href?: string;
  /** URL de la chaîne (par défaut `/@<handle>`). */
  channelHref?: string;
  /** Composant de lien injecté (`next/link`) — `'a'` par défaut. */
  linkComponent?: LinkComponent;
  /** Active l'aperçu vidéo au survol (vrai par défaut). */
  hoverPreview?: boolean;
  /** Délai avant le déclenchement de l'aperçu, en ms. */
  previewDelay?: number;
  /** Clic sur la miniature ou le titre (mesure du CTR côté page). */
  onClick?: (video: VideoCardDTO) => void;
  className?: string;
}

/** URL canonique de la page de visionnage. */
export function buildWatchHref(videoId: string): string {
  return `/watch?v=${videoId}`;
}

/** Entrées par défaut du menu contextuel d'une vidéo. */
export function buildVideoMenuItems(
  videoId: string,
  onMenuAction?: (action: VideoMenuAction, videoId: string) => void,
): DropdownMenuItem[] {
  const item = (
    id: VideoMenuAction,
    label: string,
    icon: DropdownMenuItem['icon'],
    danger = false,
  ): DropdownMenuItem => ({
    id,
    label,
    icon,
    danger,
    onSelect: () => onMenuAction?.(id, videoId),
  });

  return [
    item('queue', "Ajouter à la file d'attente", <ListVideo size={18} />),
    item('watch-later', 'À regarder plus tard', <Clock size={18} />),
    item('save', 'Enregistrer dans une playlist', <Save size={18} />),
    item('share', 'Partager', <Share2 size={18} />),
    { id: 'sep', separator: true },
    item('not-interested', 'Ne pas recommander', <Ban size={18} />, true),
  ];
}

/**
 * Largeur de la miniature par disposition.
 *
 * En `list` et `compact`, la largeur était fixée en pixels : à 360 px de
 * viewport, 160 px puis 168 px de miniature mangeaient la moitié de la ligne
 * et il ne restait qu'une colonne de texte inexploitable. On passe donc à un
 * pourcentage borné (≈ 40 %) tant qu'on est sous 480 px, puis on rebascule sur
 * les largeurs fixes historiques à partir de `xs` — le rendu ≥ 480 px, et donc
 * tout le desktop, est inchangé.
 */
const THUMB_WIDTH: Record<VideoCardLayout, string> = {
  grid: 'w-full',
  list: 'w-[40%] min-w-[112px] max-w-[180px] shrink-0 xs:w-60 xs:max-w-none feed-3:w-[360px]',
  compact: 'w-[42%] min-w-[112px] max-w-[168px] shrink-0 xs:w-[168px] xs:max-w-none',
};

/** Carte vidéo : miniature, aperçu au survol, métadonnées et menu contextuel. */
export function VideoCard({
  video,
  layout = 'grid',
  showChannel,
  onImpression,
  menuItems,
  onMenuAction,
  href,
  channelHref,
  linkComponent,
  hoverPreview = true,
  previewDelay = 600,
  onClick,
  className,
}: VideoCardProps) {
  const Link = resolveLinkComponent(linkComponent);
  const rootRef = useRef<HTMLElement | null>(null);
  const timerRef = useRef<ReturnType<typeof setTimeout> | null>(null);
  const [previewing, setPreviewing] = useState(false);
  const [menuOpen, setMenuOpen] = useState(false);

  const reducedMotion = usePrefersReducedMotion();
  const isTouch = useIsTouchDevice();

  const withChannel = showChannel ?? layout !== 'compact';
  const watchHref = href ?? buildWatchHref(video.id);
  const targetChannelHref =
    channelHref ??
    (video.channel.handle.startsWith('@')
      ? `/${video.channel.handle}`
      : `/@${video.channel.handle}`);

  // Impression unique à 50 % de visibilité — alimente le CTR
  const handleImpression = useCallback(() => {
    onImpression?.(video.id);
  }, [onImpression, video.id]);

  useImpression(rootRef, onImpression ? handleImpression : undefined, {
    threshold: 0.5,
  });

  /** L'aperçu n'a de sens que sur pointeur fin, sans réduction d'animation. */
  const canPreview =
    hoverPreview && Boolean(video.previewClipUrl) && !reducedMotion && !isTouch;

  const cancelPreview = useCallback(() => {
    if (timerRef.current) {
      clearTimeout(timerRef.current);
      timerRef.current = null;
    }
    setPreviewing(false);
  }, []);

  const schedulePreview = useCallback(() => {
    if (!canPreview || timerRef.current) return;
    timerRef.current = setTimeout(() => {
      timerRef.current = null;
      setPreviewing(true);
    }, previewDelay);
  }, [canPreview, previewDelay]);

  // Nettoyage du minuteur au démontage
  useEffect(() => cancelPreview, [cancelPreview]);

  const items = useMemo(
    () => menuItems ?? buildVideoMenuItems(video.id, onMenuAction),
    [menuItems, onMenuAction, video.id],
  );

  const publishedLabel = video.publishedAt
    ? formatRelativeTime(video.publishedAt)
    : null;

  const thumbnail = (
    <Link
      href={watchHref}
      tabIndex={-1}
      aria-hidden="true"
      onClick={() => onClick?.(video)}
      className={cn(
        'relative block aspect-video overflow-hidden rounded-kt bg-bg-elevated',
        THUMB_WIDTH[layout],
      )}
    >
      {video.thumbnailUrl ? (
        <img
          src={video.thumbnailUrl}
          alt=""
          loading="lazy"
          decoding="async"
          className={cn(
            'size-full object-cover transition-opacity duration-300',
            previewing && 'opacity-0',
          )}
        />
      ) : (
        <span className="flex size-full items-center justify-center text-fg-subtle">
          <ListVideo size={28} aria-hidden="true" />
        </span>
      )}

      {/* Aperçu vidéo silencieux après ~600 ms de survol */}
      {previewing && video.previewClipUrl ? (
        <video
          src={video.previewClipUrl}
          muted
          autoPlay
          loop
          playsInline
          preload="none"
          aria-hidden="true"
          className="absolute inset-0 size-full animate-fade-in object-cover"
        />
      ) : null}

      {/* Durée en surimpression */}
      {video.durationSec > 0 ? (
        <span
          className={cn(
            'absolute bottom-1 right-1 rounded px-1 py-0.5 text-kt-xs font-medium',
            'bg-black/80 text-white tabular-nums transition-opacity',
            previewing && 'opacity-0',
          )}
        >
          {formatDuration(video.durationSec)}
        </span>
      ) : null}

      {/* Progression de visionnage */}
      {typeof video.watchedPct === 'number' && video.watchedPct > 0 ? (
        <span className="absolute inset-x-0 bottom-0 block h-1 bg-white/30">
          <span
            className="block h-full bg-brand"
            style={{ width: `${Math.min(100, Math.max(0, video.watchedPct))}%` }}
          />
        </span>
      ) : null}
    </Link>
  );

  const menu = (
    <DropdownMenu
      items={items}
      align="end"
      label="Actions sur la vidéo"
      onOpenChange={setMenuOpen}
      className={cn(
        'shrink-0 opacity-0 transition-opacity',
        'group-hover/card:opacity-100 group-focus-within/card:opacity-100',
        // Le menu ouvert reste visible même si le pointeur quitte la carte
        (isTouch || menuOpen) && 'opacity-100',
      )}
      trigger={(triggerProps) => (
        <IconButton
          {...triggerProps}
          aria-label="Plus d'actions"
          size="sm"
          // `halo` et pas `grow` : en `list`/`compact` sur téléphone, la
          // colonne de texte fait déjà à peine 190 px. Élargir le bouton à
          // 44 px lui en prendrait 12 de plus ; le pseudo-élément donne la
          // même zone tactile sans rien décaler.
          touchTarget="halo"
          className="-mr-1"
        >
          <MoreVertical size={18} />
        </IconButton>
      )}
    />
  );

  const title = (
    <Link
      href={watchHref}
      onClick={() => onClick?.(video)}
      title={video.title}
      className={cn(
        'kt-clamp-2 break-words rounded font-medium text-fg kt-focus-ring',
        // 20 px de titre sur une colonne de ~190 px ne tiendrait pas en
        // 2 lignes : on garde la taille « recherche » à partir de 480 px.
        layout === 'list' ? 'text-kt-base xs:text-kt-lg xs:leading-7' : 'text-kt-md',
      )}
    >
      {video.title}
    </Link>
  );

  const channelLine = withChannel ? (
    <Link
      href={targetChannelHref}
      className="flex min-w-0 items-center gap-1 rounded text-kt-sm text-fg-muted transition-colors hover:text-fg kt-focus-ring"
    >
      <span className="truncate">{video.channel.name}</span>
      {video.channel.verified ? <VerifiedBadge size={12} /> : null}
    </Link>
  ) : null;

  const stats = (
    // `flex-wrap` + `min-w-0` : « 1,2 M de vues • il y a 3 heures » repasse à
    // la ligne au lieu de pousser la carte au-delà du viewport.
    <p className="flex min-w-0 flex-wrap items-center gap-x-1 text-kt-sm text-fg-muted">
      {/* La miniature est masquée aux lecteurs d'écran : la durée est restituée ici */}
      {video.durationSec > 0 ? (
        <span className="sr-only">Durée : {formatDuration(video.durationSec)}. </span>
      ) : null}
      <span>{formatViews(video.viewCount)}</span>
      {publishedLabel ? (
        <>
          <span aria-hidden="true">•</span>
          <span>{publishedLabel}</span>
        </>
      ) : null}
      {video.isNew ? (
        <Badge variant="new" className="ml-1">
          Nouveau
        </Badge>
      ) : null}
    </p>
  );

  // ── Disposition grille (feed) ────────────────────────────────────────────
  if (layout === 'grid') {
    return (
      <article
        ref={rootRef}
        onPointerEnter={schedulePreview}
        onPointerLeave={cancelPreview}
        className={cn('group/card flex w-full flex-col gap-3', className)}
      >
        {thumbnail}
        <div className="flex gap-3">
          {withChannel ? (
            <Link
              href={targetChannelHref}
              aria-label={video.channel.name}
              className="mt-0.5 shrink-0 rounded-full kt-focus-ring"
            >
              <Avatar
                name={video.channel.name}
                src={video.channel.avatarUrl}
                size="md"
              />
            </Link>
          ) : null}

          <div className="flex min-w-0 flex-1 flex-col gap-0.5">
            {title}
            {channelLine}
            {stats}
          </div>

          {menu}
        </div>
      </article>
    );
  }

  // ── Dispositions liste (recherche) et compacte (sidebar) ─────────────────
  const isList = layout === 'list';

  return (
    <article
      ref={rootRef}
      onPointerEnter={schedulePreview}
      onPointerLeave={cancelPreview}
      className={cn(
        'group/card flex w-full',
        // Gouttière réduite sous 480 px : 16 px entre miniature et texte,
        // c'est 5 % de la largeur d'un iPhone SE.
        isList ? 'gap-2 xs:gap-4' : 'gap-2',
        className,
      )}
    >
      {thumbnail}

      <div className="flex min-w-0 flex-1 flex-col gap-0.5">
        <div className="flex items-start gap-1">
          <div className="min-w-0 flex-1">
            {isList ? (
              <>
                {title}
                {stats}
              </>
            ) : (
              <Link
                href={watchHref}
                onClick={() => onClick?.(video)}
                title={video.title}
                className="kt-clamp-2 break-words rounded text-kt-base font-medium text-fg kt-focus-ring"
              >
                {video.title}
              </Link>
            )}
          </div>
          {menu}
        </div>

        {isList ? (
          withChannel ? (
            <Link
              href={targetChannelHref}
              className="mt-2 flex min-w-0 items-center gap-2 rounded text-kt-sm text-fg-muted transition-colors hover:text-fg kt-focus-ring"
            >
              <Avatar
                name={video.channel.name}
                src={video.channel.avatarUrl}
                size="xs"
              />
              <span className="truncate">{video.channel.name}</span>
              {video.channel.verified ? <VerifiedBadge size={12} /> : null}
            </Link>
          ) : null
        ) : (
          <>
            {channelLine ?? (
              <span className="truncate text-kt-sm text-fg-muted">
                {video.channel.name}
              </span>
            )}
            {stats}
          </>
        )}
      </div>
    </article>
  );
}
