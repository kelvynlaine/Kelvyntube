'use client';

import { useCallback, useEffect, useRef, useState, type ReactNode } from 'react';
import Link from 'next/link';
import { useRouter } from 'next/navigation';
import { useMutation, useQuery } from '@tanstack/react-query';
import {
  ROUTES,
  formatCompactNumber,
  type LikeState,
  type NotificationLevel,
  type VideoCardDTO,
  type VideoDetailDTO,
} from '@kelvyntube/shared';
import {
  ChannelAvatar,
  DropdownMenu,
  HashtagList,
  IconButton,
  LikeBar,
  Spinner,
  SubscribeButton,
  cn,
} from '@kelvyntube/ui';
import { Link2, MessageCircle, MoreVertical, Share2, SquarePlay } from 'lucide-react';
import { ShortsPlayer } from '@/components/player';
import { api } from '@/lib/api';
import { useAuth } from '@/lib/auth-context';
import { PATHS } from '@/lib/nav';
import { ShortsCommentsSheet } from './ShortsCommentsSheet';

/** Réponse de `POST /videos/:id/like`. */
interface VideoLikeResultDTO {
  like: LikeState;
  likeCount: number;
  dislikeCount: number | null;
}

/** Réponse de `POST /channels/:id/subscribe`. */
interface SubscribeResultDTO {
  subscribed: boolean;
  level: NotificationLevel;
  subscriberCount: number;
}

export interface ShortsSlideProps {
  video: VideoCardDTO;
  /** Un seul Short actif à la fois : lui seul joue et compte une vue. */
  active: boolean;
  /**
   * Fenêtre de montage (précédent / courant / suivant) : au-delà, seule la
   * miniature est rendue, pour ne pas saturer la mémoire du navigateur.
   */
  mounted: boolean;
  muted: boolean;
  onMutedChange: (muted: boolean) => void;
  /** Prévient le feed qu'une couche modale s'ouvre (navigation clavier suspendue). */
  onOverlayOpenChange?: (open: boolean) => void;
}

/** Une « diapositive » du feed Shorts : lecteur + rail d'actions + métadonnées. */
export function ShortsSlide({
  video,
  active,
  mounted,
  muted,
  onMutedChange,
  onOverlayOpenChange,
}: ShortsSlideProps) {
  const router = useRouter();
  const { requireAuth } = useAuth();

  const [commentsOpen, setCommentsOpen] = useState(false);
  const [feedback, setFeedback] = useState<string | null>(null);
  const feedbackTimer = useRef<ReturnType<typeof setTimeout> | null>(null);

  // Détail complet : seul `VideoDetailDTO` porte les URLs de lecture.
  const detailQuery = useQuery({
    queryKey: ['video', video.id],
    queryFn: () =>
      api.get<VideoDetailDTO>(ROUTES.videos.byId(video.id), {
        allowAnonymous: true,
      }),
    enabled: mounted,
    staleTime: 60_000,
  });
  const detail = detailQuery.data;

  // ── État local des interactions (réponse serveur prioritaire) ────────────
  const [likeOverride, setLikeOverride] = useState<VideoLikeResultDTO | null>(null);
  const [subscription, setSubscription] = useState<{
    subscribed: boolean;
    level: NotificationLevel | null;
  } | null>(null);

  useEffect(() => {
    setLikeOverride(null);
    setSubscription(null);
  }, [video.id]);

  const likeState: LikeState = likeOverride?.like ?? detail?.viewer.like ?? 'NONE';
  const likeCount = likeOverride?.likeCount ?? detail?.likeCount ?? 0;
  const subscribed =
    subscription?.subscribed ?? detail?.channel.viewer.isSubscribed ?? false;
  const notificationLevel =
    subscription?.level ?? detail?.channel.viewer.notificationLevel ?? null;

  const likeMutation = useMutation({
    mutationFn: (value: 1 | -1 | 0) =>
      api.post<VideoLikeResultDTO>(ROUTES.videos.like(video.id), { value }),
    onSuccess: setLikeOverride,
  });

  const subscribeMutation = useMutation({
    mutationFn: (level: NotificationLevel) =>
      api.post<SubscribeResultDTO>(ROUTES.channels.subscribe(video.channel.id), {
        level,
      }),
    onSuccess: (result) =>
      setSubscription({ subscribed: result.subscribed, level: result.level }),
  });

  const unsubscribeMutation = useMutation({
    mutationFn: () => api.delete(ROUTES.channels.unsubscribe(video.channel.id)),
    onSuccess: () => setSubscription({ subscribed: false, level: null }),
  });

  const toggleLike = useCallback(
    (target: Extract<LikeState, 'LIKE' | 'DISLIKE'>) => {
      if (!requireAuth()) return;
      const value = likeState === target ? 0 : target === 'LIKE' ? 1 : -1;
      likeMutation.mutate(value);
    },
    [likeMutation, likeState, requireAuth],
  );

  // ── Message éphémère (copie de lien) ─────────────────────────────────────
  const showFeedback = useCallback((message: string) => {
    setFeedback(message);
    if (feedbackTimer.current) clearTimeout(feedbackTimer.current);
    feedbackTimer.current = setTimeout(() => setFeedback(null), 2_500);
  }, []);

  useEffect(
    () => () => {
      if (feedbackTimer.current) clearTimeout(feedbackTimer.current);
    },
    [],
  );

  const shortUrl = useCallback(
    () =>
      typeof window === 'undefined'
        ? PATHS.short(video.id)
        : `${window.location.origin}${PATHS.short(video.id)}`,
    [video.id],
  );

  const copyLink = useCallback(async () => {
    try {
      await navigator.clipboard.writeText(shortUrl());
      showFeedback('Lien copié');
    } catch {
      showFeedback('Copie impossible');
    }
  }, [shortUrl, showFeedback]);

  const share = useCallback(async () => {
    const url = shortUrl();
    if (typeof navigator !== 'undefined' && navigator.share) {
      try {
        await navigator.share({ title: video.title, url });
        return;
      } catch {
        return; // partage annulé par l'utilisateur
      }
    }
    await copyLink();
  }, [copyLink, shortUrl, video.title]);

  const openComments = useCallback(
    (open: boolean) => {
      setCommentsOpen(open);
      onOverlayOpenChange?.(open);
    },
    [onOverlayOpenChange],
  );

  // Le Short quitte l'écran : on referme la feuille de commentaires.
  useEffect(() => {
    if (!active && commentsOpen) openComments(false);
  }, [active, commentsOpen, openComments]);

  const showPlayer = mounted && Boolean(detail);

  return (
    <div className="relative flex h-full w-full items-center justify-center bg-black">
      {/*
        Même cadre 9:16 que `ShortsPlayer` : les surcouches restent alignées.
        `dvh` plutôt que `vh` : sur mobile la barre d'URL fait varier la
        hauteur réelle, et `100vh` laisserait un cadre plus haut que l'écran.
      */}
      <div className="relative h-full w-full max-w-[calc(100dvh*9/16)]">
        {showPlayer && detail ? (
          // `ShortsPlayer` occupe déjà toute la boîte (`h-full w-full`) :
          // le positionnement absolu entrerait en conflit avec son `relative`.
          <ShortsPlayer
            video={detail}
            active={active}
            muted={muted}
            onMutedChange={onMutedChange}
          />
        ) : (
          <div className="absolute inset-0 overflow-hidden bg-black">
            {video.thumbnailUrl ? (
              <img
                src={video.thumbnailUrl}
                alt=""
                loading="lazy"
                decoding="async"
                className="size-full object-cover opacity-60"
              />
            ) : null}
            {mounted ? (
              <span
                role="status"
                className="absolute inset-0 flex items-center justify-center"
              >
                <Spinner size={32} className="text-white" />
                <span className="sr-only">Chargement du Short…</span>
              </span>
            ) : null}
          </div>
        )}

        {/* Surcouches limitées à la fenêtre de montage (précédent/courant/suivant) */}
        {mounted ? (
          <>
            {/*
              ── Rail d'actions (droite) ───────────────────────────────────
              Le bas du rail est relevé de la safe-area iOS : sinon les
              dernières actions tombent derrière la barre d'accueil.
            */}
            <div className="pointer-events-none absolute bottom-[calc(1.5rem+env(safe-area-inset-bottom))] right-2 z-30 flex flex-col items-center gap-4">
              <div className="pointer-events-auto flex flex-col items-center gap-2">
                <ChannelAvatar
                  channel={video.channel}
                  size="md"
                  withLink
                  href={PATHS.channel(video.channel.handle)}
                  linkComponent={Link}
                />
                <SubscribeButton
                  size="sm"
                  compact
                  subscribed={subscribed}
                  notificationLevel={notificationLevel}
                  loading={subscribeMutation.isPending || unsubscribeMutation.isPending}
                  onSubscribe={() => {
                    if (!requireAuth()) return;
                    subscribeMutation.mutate('PERSONALIZED');
                  }}
                  onUnsubscribe={() => {
                    if (!requireAuth()) return;
                    unsubscribeMutation.mutate();
                  }}
                  onLevelChange={(level) => {
                    if (!requireAuth()) return;
                    subscribeMutation.mutate(level);
                  }}
                />
              </div>

              <LikeBar
                size="sm"
                state={likeState}
                likeCount={likeCount}
                dislikeCount={
                  likeOverride?.dislikeCount ?? detail?.dislikeCount ?? null
                }
                disabled={likeMutation.isPending}
                onLike={() => toggleLike('LIKE')}
                onDislike={() => toggleLike('DISLIKE')}
                /*
                 * En colonne, les deux boutons `size="sm"` du DS ne font que
                 * 32 px de haut : au doigt (et au doigt seulement, pour ne pas
                 * alourdir le rail sur desktop) on les porte à 44 px.
                 */
                className="pointer-events-auto flex-col rounded-kt bg-bg-elevated/85 backdrop-blur [@media(pointer:coarse)]:[&>button]:min-h-11 [@media(pointer:coarse)]:[&>button]:min-w-11"
              />

              <RailAction
                label="Commentaires"
                count={detail?.commentCount}
                icon={<MessageCircle size={22} />}
                onClick={() => openComments(true)}
              />

              <RailAction
                label="Partager"
                icon={<Share2 size={22} />}
                onClick={() => void share()}
              />

              <div className="pointer-events-auto">
                <DropdownMenu
                  align="end"
                  side="top"
                  label="Autres actions"
                  items={[
                    {
                      id: 'copy',
                      label: 'Copier le lien',
                      icon: <Link2 size={18} />,
                      onSelect: () => void copyLink(),
                    },
                    {
                      id: 'watch',
                      label: 'Ouvrir la page de la vidéo',
                      icon: <SquarePlay size={18} />,
                      onSelect: () => router.push(PATHS.watch(video.id)),
                    },
                  ]}
                  trigger={(triggerProps) => (
                    <IconButton
                      {...triggerProps}
                      aria-label="Autres actions"
                      variant="overlay"
                      size="md"
                    >
                      <MoreVertical size={22} />
                    </IconButton>
                  )}
                />
              </div>
            </div>

            {/* ── Métadonnées (bas de l'écran) ───────────────────────────────── */}
            {/* `pr-20` réserve la largeur du rail ; le bas suit la safe-area iOS. */}
            <div className="pointer-events-none absolute inset-x-0 bottom-0 z-20 flex flex-col gap-1 bg-gradient-to-t from-black/85 via-black/40 to-transparent px-4 pb-[calc(2rem+env(safe-area-inset-bottom))] pr-20 pt-16">
              <Link
                href={PATHS.channel(video.channel.handle)}
                className="pointer-events-auto w-fit rounded text-kt-base font-medium text-white kt-focus-ring hover:underline"
              >
                @{video.channel.handle}
              </Link>

              <p className="kt-clamp-2 text-kt-base text-white">{video.title}</p>

              {detail && detail.tags.length > 0 ? (
                <HashtagList
                  tags={detail.tags.map((tag) => tag.name)}
                  max={4}
                  linkComponent={Link}
                  hrefFor={(tag) => PATHS.hashtag(tag)}
                  className="pointer-events-auto text-white [&_a]:text-white/90"
                />
              ) : null}
            </div>
          </>
        ) : null}

        {/* Confirmation éphémère (copie de lien) */}
        {feedback ? (
          <p
            role="status"
            aria-live="polite"
            className="absolute bottom-24 left-1/2 z-40 -translate-x-1/2 rounded-pill bg-black/80 px-4 py-2 text-kt-sm font-medium text-white"
          >
            {feedback}
          </p>
        ) : null}
      </div>

      {detail ? (
        <ShortsCommentsSheet
          videoId={video.id}
          open={commentsOpen}
          onClose={() => openComments(false)}
          commentCount={detail.commentCount}
          creatorName={video.channel.name}
        />
      ) : null}
    </div>
  );
}

interface RailActionProps {
  label: string;
  icon: ReactNode;
  count?: number;
  onClick: () => void;
  className?: string;
}

/** Bouton rond du rail avec son compteur. */
function RailAction({ label, icon, count, onClick, className }: RailActionProps) {
  return (
    <div
      className={cn('pointer-events-auto flex flex-col items-center gap-1', className)}
    >
      {/* `IconButton` porte déjà sa boîte à 44 px sur pointeur grossier. */}
      <IconButton aria-label={label} variant="overlay" size="md" onClick={onClick}>
        {icon}
      </IconButton>
      {typeof count === 'number' ? (
        <span className="text-kt-xs font-medium tabular-nums text-white">
          {formatCompactNumber(count)}
        </span>
      ) : null}
    </div>
  );
}
