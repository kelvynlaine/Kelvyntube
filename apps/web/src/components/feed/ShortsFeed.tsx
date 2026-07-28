'use client';

import { useCallback, useEffect, useMemo, useRef, useState } from 'react';
import Link from 'next/link';
import { useInfiniteQuery, useQuery } from '@tanstack/react-query';
import {
  ROUTES,
  type CursorPage,
  type VideoCardDTO,
  type VideoDetailDTO,
} from '@kelvyntube/shared';
import {
  EmptyState,
  IconButton,
  Spinner,
  usePrefersReducedMotion,
} from '@kelvyntube/ui';
import { ArrowLeft, ChevronDown, ChevronUp } from 'lucide-react';
import { api } from '@/lib/api';
import { PATHS } from '@/lib/nav';
import { FeedErrorState } from './FeedErrorState';
import { ShortsIcon } from './ShortsIcon';
import { ShortsSlide } from './ShortsSlide';

/** Taille de page du flux vertical. */
const SHORTS_PAGE_SIZE = 10;
/** Shorts restants sous lesquels on précharge la page suivante. */
const PRELOAD_THRESHOLD = 3;
/** Verrou anti-rafale de la molette (ms). */
const WHEEL_LOCK_MS = 550;

export interface ShortsFeedProps {
  /** `?v=<id>` : le feed démarre sur ce Short. */
  seedVideoId?: string | null;
}

/** Convertit un détail de vidéo en carte (pour l'amorçage `?v=`). */
function toCard(detail: VideoDetailDTO): VideoCardDTO {
  return {
    id: detail.id,
    title: detail.title,
    thumbnailUrl: detail.thumbnailUrl,
    previewClipUrl: null,
    durationSec: detail.durationSec,
    viewCount: detail.viewCount,
    publishedAt: detail.publishedAt,
    kind: detail.kind,
    channel: {
      id: detail.channel.id,
      handle: detail.channel.handle,
      name: detail.channel.name,
      avatarUrl: detail.channel.avatarUrl,
      verified: detail.channel.verified,
      subscriberCount: detail.channel.subscriberCount,
    },
  };
}

/**
 * ═══════════════════════════════════════════════════════════════════════════
 *  FEED SHORTS — plein écran, un Short par « snap » vertical.
 *  Navigation : défilement natif (tactile), molette discrète, flèches ↑/↓ et
 *  boutons flottants sur desktop. Seuls trois lecteurs sont montés à la fois.
 * ═══════════════════════════════════════════════════════════════════════════
 */
export function ShortsFeed({ seedVideoId }: ShortsFeedProps) {
  const containerRef = useRef<HTMLDivElement | null>(null);
  const [index, setIndex] = useState(0);
  const [muted, setMuted] = useState(true);
  const [overlayOpen, setOverlayOpen] = useState(false);
  const reducedMotion = usePrefersReducedMotion();

  // ── Données ──────────────────────────────────────────────────────────────
  // L'API exclut la vidéo d'amorçage de ses candidats : on la place en tête.
  const seedQuery = useQuery({
    queryKey: ['video', seedVideoId],
    queryFn: () =>
      api.get<VideoDetailDTO>(ROUTES.videos.byId(seedVideoId as string), {
        allowAnonymous: true,
      }),
    enabled: Boolean(seedVideoId),
    staleTime: 60_000,
  });

  const feedQuery = useInfiniteQuery({
    queryKey: ['feed', 'shorts', seedVideoId ?? null],
    initialPageParam: null as string | null,
    queryFn: ({ pageParam }) =>
      api.get<CursorPage<VideoCardDTO>>(ROUTES.feed.shorts, {
        query: {
          cursor: pageParam ?? undefined,
          limit: SHORTS_PAGE_SIZE,
          seedVideoId: seedVideoId ?? undefined,
        },
        allowAnonymous: true,
      }),
    getNextPageParam: (lastPage) => lastPage.nextCursor,
  });

  const items = useMemo(() => {
    const pages = feedQuery.data?.pages.flatMap((page) => page.items) ?? [];
    const seed = seedQuery.data ? toCard(seedQuery.data) : null;
    const merged = seed ? [seed, ...pages] : pages;
    // Déduplication défensive (le curseur peut chevaucher après invalidation).
    const seen = new Set<string>();
    return merged.filter((video) => {
      if (seen.has(video.id)) return false;
      seen.add(video.id);
      return true;
    });
  }, [feedQuery.data, seedQuery.data]);

  const countRef = useRef(items.length);
  countRef.current = items.length;
  const indexRef = useRef(index);
  indexRef.current = index;

  // ── Navigation ───────────────────────────────────────────────────────────
  const goTo = useCallback(
    (target: number) => {
      const el = containerRef.current;
      if (!el) return;
      const max = Math.max(countRef.current - 1, 0);
      const next = Math.min(Math.max(target, 0), max);
      el.scrollTo({
        top: next * el.clientHeight,
        behavior: reducedMotion ? 'auto' : 'smooth',
      });
      setIndex(next);
    },
    [reducedMotion],
  );
  const goToRef = useRef(goTo);
  goToRef.current = goTo;

  // Index courant déduit de la position de défilement (tactile + molette).
  useEffect(() => {
    const el = containerRef.current;
    if (!el) return;
    let frame = 0;

    const onScroll = () => {
      if (frame) return;
      frame = requestAnimationFrame(() => {
        frame = 0;
        const height = el.clientHeight || 1;
        const next = Math.round(el.scrollTop / height);
        setIndex((prev) => (next !== prev && next >= 0 ? next : prev));
      });
    };

    el.addEventListener('scroll', onScroll, { passive: true });
    return () => {
      el.removeEventListener('scroll', onScroll);
      if (frame) cancelAnimationFrame(frame);
    };
  }, []);

  // Molette : un geste = un Short (sinon le défilement natif en saute plusieurs).
  useEffect(() => {
    const el = containerRef.current;
    if (!el) return;
    let locked = false;
    let timer: ReturnType<typeof setTimeout> | null = null;

    const onWheel = (event: WheelEvent) => {
      if (Math.abs(event.deltaY) < 4) return;
      event.preventDefault();
      if (locked) return;
      locked = true;
      timer = setTimeout(() => {
        locked = false;
      }, WHEEL_LOCK_MS);
      goToRef.current(indexRef.current + (event.deltaY > 0 ? 1 : -1));
    };

    el.addEventListener('wheel', onWheel, { passive: false });
    return () => {
      el.removeEventListener('wheel', onWheel);
      if (timer) clearTimeout(timer);
    };
  }, []);

  // Clavier : ↑ / ↓ / Page précédente / Page suivante / Début / Fin.
  useEffect(() => {
    if (overlayOpen) return;

    const onKeyDown = (event: KeyboardEvent) => {
      const target = event.target as HTMLElement | null;
      if (
        target &&
        (target.isContentEditable ||
          ['INPUT', 'TEXTAREA', 'SELECT'].includes(target.tagName))
      ) {
        return;
      }

      let next: number | null = null;
      if (event.key === 'ArrowDown' || event.key === 'PageDown') {
        next = indexRef.current + 1;
      } else if (event.key === 'ArrowUp' || event.key === 'PageUp') {
        next = indexRef.current - 1;
      } else if (event.key === 'Home') {
        next = 0;
      } else if (event.key === 'End') {
        next = countRef.current - 1;
      }

      if (next === null) return;
      event.preventDefault();
      goToRef.current(next);
    };

    window.addEventListener('keydown', onKeyDown);
    return () => window.removeEventListener('keydown', onKeyDown);
  }, [overlayOpen]);

  // Préchargement : dès qu'il reste 3 Shorts sous le doigt.
  const { hasNextPage, isFetchingNextPage, fetchNextPage } = feedQuery;
  useEffect(() => {
    if (!hasNextPage || isFetchingNextPage) return;
    if (items.length - index <= PRELOAD_THRESHOLD) void fetchNextPage();
  }, [fetchNextPage, hasNextPage, index, isFetchingNextPage, items.length]);

  // ── États de chargement / erreur / vide ──────────────────────────────────
  const initialLoading =
    feedQuery.isLoading || (Boolean(seedVideoId) && seedQuery.isLoading);

  const backButton = (
    <Link
      href={PATHS.home}
      aria-label="Retour à l'accueil"
      /*
       * Cible ≥ 44 px et décalage sous l'encoche iOS : sans la safe-area haute
       * le bouton se retrouve sous la barre d'état en mode plein écran.
       */
      className="absolute left-3 top-[calc(0.75rem+env(safe-area-inset-top))] z-40 flex size-10 items-center justify-center rounded-full text-white bg-black/60 transition-colors hover:bg-black/80 kt-focus-ring kt-tap"
    >
      <ArrowLeft size={22} aria-hidden="true" />
    </Link>
  );

  if (initialLoading) {
    return (
      <div className="relative flex h-[100dvh] w-full items-center justify-center bg-black">
        {backButton}
        <Spinner size={36} className="text-white" label="Chargement des Shorts" />
      </div>
    );
  }

  if (feedQuery.isError && items.length === 0) {
    return (
      <div className="relative flex h-[100dvh] w-full items-center justify-center bg-black px-4">
        {backButton}
        <FeedErrorState
          title="Impossible de charger les Shorts"
          description="Vérifiez votre connexion, puis réessayez."
          onRetry={() => void feedQuery.refetch()}
          retrying={feedQuery.isFetching}
          className="max-w-md"
        />
      </div>
    );
  }

  if (items.length === 0) {
    return (
      <div className="relative flex h-[100dvh] w-full items-center justify-center bg-black px-4">
        {backButton}
        <EmptyState
          icon={<ShortsIcon size={28} />}
          title="Aucun Short pour le moment"
          description="Revenez bientôt : de nouveaux Shorts arrivent chaque jour."
          action={
            <Link href={PATHS.home} className="kt-btn-primary">
              Retour à l&apos;accueil
            </Link>
          }
        />
      </div>
    );
  }

  return (
    <div className="relative h-[100dvh] w-full overflow-hidden bg-black">
      {backButton}

      <div
        ref={containerRef}
        /*
         * `touch-action: pan-y` : le geste tactile est strictement vertical,
         * ce qui évite que le navigateur hésite entre défilement et « swipe
         * retour » horizontal et rende le passage d'un Short à l'autre saccadé.
         */
        className="kt-no-scrollbar h-full w-full touch-pan-y snap-y snap-mandatory overflow-y-auto overscroll-y-contain"
      >
        {items.map((video, position) => (
          <div key={video.id} className="h-[100dvh] w-full snap-start snap-always">
            <ShortsSlide
              video={video}
              active={position === index}
              mounted={Math.abs(position - index) <= 1}
              muted={muted}
              onMutedChange={setMuted}
              onOverlayOpenChange={setOverlayOpen}
            />
          </div>
        ))}

        {isFetchingNextPage ? (
          <div className="flex h-24 w-full items-center justify-center">
            <Spinner size={24} className="text-white" label="Chargement" />
          </div>
        ) : null}
      </div>

      {/* Boutons précédent / suivant (desktop) */}
      <div className="pointer-events-none absolute right-4 top-1/2 z-40 hidden -translate-y-1/2 flex-col gap-3 feed-3:flex">
        <IconButton
          aria-label="Short précédent"
          variant="overlay"
          size="lg"
          disabled={index === 0}
          onClick={() => goTo(index - 1)}
          className="pointer-events-auto"
        >
          <ChevronUp size={24} />
        </IconButton>
        <IconButton
          aria-label="Short suivant"
          variant="overlay"
          size="lg"
          disabled={index >= items.length - 1 && !hasNextPage}
          onClick={() => goTo(index + 1)}
          className="pointer-events-auto"
        >
          <ChevronDown size={24} />
        </IconButton>
      </div>
    </div>
  );
}
