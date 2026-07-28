'use client';

import { ROUTES, type SearchResultsDTO } from '@kelvyntube/shared';
import {
  Button,
  EmptyState,
  Spinner,
  VideoCard,
  VideoCardSkeleton,
} from '@kelvyntube/ui';
import { useInfiniteQuery } from '@tanstack/react-query';
import { RotateCw, Search, SearchX, TriangleAlert } from 'lucide-react';
import Link from 'next/link';
import { usePathname, useRouter, useSearchParams } from 'next/navigation';
import { Fragment, useCallback, useEffect, useMemo, useRef } from 'react';
import { api } from '@/lib/api';
import { PATHS } from '@/lib/nav';
import { ChannelResultCard } from './ChannelResultCard';
import { PlaylistResultCard } from './PlaylistResultCard';
import {
  DEFAULT_SEARCH_FILTERS,
  SearchFilters,
  countActiveFilters,
  parseSearchFilters,
  type SearchFilterKey,
  type SearchFilterValues,
} from './SearchFilters';
import { pushRecentSearch } from './useRecentSearches';
import { useSearchTracking } from './useSearchTracking';

/**
 * ═══════════════════════════════════════════════════════════════════════════
 *  RÉSULTATS DE RECHERCHE — /resultats?q=…&duration=…&uploadDate=…&type=…&sort=…
 *  L'URL est la seule source de vérité : les filtres la mettent à jour via
 *  `router.replace` et la requête `@tanstack/react-query` s'y recale.
 * ═══════════════════════════════════════════════════════════════════════════
 */

/** Nombre de vidéos demandées par page. */
const PAGE_SIZE = 20;
/** Les chaînes s'intercalent après les 3 premiers résultats vidéo. */
const CHANNEL_SLOT = 3;
/** Les playlists s'intercalent un peu plus bas. */
const PLAYLIST_SLOT = 6;

/** Construit l'URL de résultats à partir des filtres courants. */
function buildResultsHref(query: string, filters: SearchFilterValues): string {
  return PATHS.results(query, {
    duration: filters.duration,
    uploadDate: filters.uploadDate,
    type: filters.type,
    sort: filters.sort,
  });
}

/** Squelettes affichés pendant le premier chargement. */
export function SearchResultsSkeleton({ count = 8 }: { count?: number }) {
  return (
    <div className="flex flex-col gap-6" aria-hidden="true">
      {Array.from({ length: count }, (_, index) => (
        <VideoCardSkeleton key={index} layout="list" />
      ))}
    </div>
  );
}

export function SearchResults() {
  const router = useRouter();
  const pathname = usePathname();
  const searchParams = useSearchParams();

  const query = (searchParams.get('q') ?? '').trim();
  const filters = useMemo(
    () => parseSearchFilters(new URLSearchParams(searchParams.toString())),
    [searchParams],
  );
  const activeFilterCount = countActiveFilters(filters);

  const { trackImpression, trackClick } = useSearchTracking('SEARCH');

  // Toute recherche effectivement affichée alimente l'historique local.
  useEffect(() => {
    if (query) pushRecentSearch(query);
  }, [query]);

  // ── Mise à jour de l'URL (sans rechargement) ─────────────────────────────
  const handleFilterChange = useCallback(
    (key: SearchFilterKey, value: string) => {
      const next: SearchFilterValues = { ...filters, [key]: value };
      router.replace(buildResultsHref(query, next), { scroll: false });
    },
    [filters, query, router],
  );

  const handleClearFilters = useCallback(() => {
    router.replace(buildResultsHref(query, DEFAULT_SEARCH_FILTERS), { scroll: false });
  }, [query, router]);

  // ── Requête paginée par curseur ──────────────────────────────────────────
  const {
    data,
    error,
    fetchNextPage,
    hasNextPage,
    isError,
    isFetchingNextPage,
    isPending,
    refetch,
  } = useInfiniteQuery({
    queryKey: [
      'search',
      query,
      filters.duration,
      filters.uploadDate,
      filters.type,
      filters.sort,
    ],
    queryFn: ({ pageParam }) =>
      api.get<SearchResultsDTO>(ROUTES.search.query, {
        query: {
          q: query,
          duration: filters.duration,
          uploadDate: filters.uploadDate,
          type: filters.type,
          sort: filters.sort,
          limit: PAGE_SIZE,
          cursor: pageParam,
        },
        allowAnonymous: true,
      }),
    initialPageParam: undefined as string | undefined,
    getNextPageParam: (lastPage) => lastPage.videos.nextCursor ?? undefined,
    enabled: query.length > 0,
  });

  const pages = useMemo(() => data?.pages ?? [], [data]);
  const videos = useMemo(() => pages.flatMap((page) => page.videos.items), [pages]);
  const channels = pages[0]?.channels ?? [];
  const playlists = pages[0]?.playlists ?? [];
  const suggestion = pages[0]?.suggestion ?? null;

  // ── Pagination infinie ───────────────────────────────────────────────────
  const sentinelRef = useRef<HTMLDivElement | null>(null);
  useEffect(() => {
    const element = sentinelRef.current;
    if (!element || !hasNextPage || isFetchingNextPage) return;
    if (typeof IntersectionObserver === 'undefined') return;

    const observer = new IntersectionObserver(
      (entries) => {
        if (entries.some((entry) => entry.isIntersecting)) void fetchNextPage();
      },
      { rootMargin: '600px 0px' },
    );
    observer.observe(element);
    return () => observer.disconnect();
  }, [hasNextPage, isFetchingNextPage, fetchNextPage]);

  // ── Blocs chaînes / playlists ────────────────────────────────────────────
  const channelBlock =
    channels.length > 0 ? (
      <section aria-label="Chaînes correspondantes" className="flex flex-col">
        {channels.map((channel) => (
          <ChannelResultCard key={channel.id} channel={channel} />
        ))}
      </section>
    ) : null;

  const playlistBlock =
    playlists.length > 0 ? (
      <section aria-label="Playlists correspondantes" className="flex flex-col gap-6">
        {playlists.map((playlist) => (
          <PlaylistResultCard key={playlist.id} playlist={playlist} />
        ))}
      </section>
    ) : null;

  const channelSlot = Math.min(CHANNEL_SLOT, videos.length);
  const playlistSlot = Math.min(PLAYLIST_SLOT, videos.length);

  // ── Aucune requête saisie ────────────────────────────────────────────────
  if (!query) {
    return (
      // Le conteneur d'`AppShell` fournit déjà la gouttière : pas de double marge.
      <div className="mx-auto w-full max-w-[1096px] py-4 feed-3:py-8">
        <EmptyState
          icon={<Search size={28} aria-hidden="true" />}
          title="Que souhaitez-vous regarder ?"
          description="Saisissez un titre, une chaîne ou un mot-clé dans la barre de recherche."
        />
      </div>
    );
  }

  const hasResults = videos.length > 0 || channels.length > 0 || playlists.length > 0;

  return (
    /* `AppShell` fournit déjà `px-4` : on n'ajoute qu'une largeur de lecture. */
    <div className="mx-auto w-full max-w-[1096px]">
      <SearchFilters
        values={filters}
        onChange={handleFilterChange}
        onClear={handleClearFilters}
        className="mb-5"
      />

      {/* Correction orthographique */}
      {suggestion && suggestion !== query ? (
        <div className="mb-5 flex flex-col gap-1 text-kt-base">
          <p className="text-fg-muted">
            Voici plutôt les résultats pour{' '}
            <Link
              href={buildResultsHref(suggestion, filters)}
              className="rounded font-medium text-fg underline underline-offset-2 kt-focus-ring"
            >
              {suggestion}
            </Link>
          </p>
          <p className="text-fg-muted">
            Rechercher plutôt{' '}
            <Link
              href={buildResultsHref(query, filters)}
              className="rounded font-medium text-fg underline underline-offset-2 kt-focus-ring"
            >
              {query}
            </Link>
          </p>
        </div>
      ) : null}

      {/* Erreur réseau */}
      {isError ? (
        <div
          role="alert"
          className="flex flex-col items-center gap-3 rounded-kt border border-border bg-bg-elevated px-6 py-10 text-center"
        >
          <TriangleAlert size={28} aria-hidden="true" className="text-danger" />
          <p className="text-kt-md font-medium text-fg">
            Impossible de charger les résultats
          </p>
          <p className="max-w-md text-kt-base text-fg-muted">
            {error instanceof Error
              ? error.message
              : 'Une erreur est survenue pendant la recherche.'}
          </p>
          <Button
            variant="secondary"
            onClick={() => void refetch()}
            iconLeft={<RotateCw size={16} aria-hidden="true" />}
          >
            Réessayer
          </Button>
        </div>
      ) : isPending ? (
        <SearchResultsSkeleton />
      ) : !hasResults ? (
        <EmptyState
          icon={<SearchX size={28} aria-hidden="true" />}
          title={`Aucun résultat pour « ${query} »`}
          description={
            <>
              Essayez de vérifier l&apos;orthographe, d&apos;utiliser d&apos;autres
              mots-clés, ou de retirer les filtres actifs.
            </>
          }
          action={
            activeFilterCount > 0 ? (
              <Button variant="secondary" onClick={handleClearFilters}>
                Effacer les filtres
              </Button>
            ) : null
          }
        />
      ) : (
        <>
          <div className="flex flex-col gap-6">
            {videos.length === 0 ? (
              <>
                {channelBlock}
                {playlistBlock}
              </>
            ) : null}

            {videos.map((video, index) => (
              <Fragment key={video.id}>
                <VideoCard
                  video={video}
                  layout="list"
                  linkComponent={Link}
                  href={PATHS.watch(video.id)}
                  channelHref={PATHS.channel(video.channel.handle)}
                  onImpression={trackImpression}
                  onClick={(clicked) => trackClick(clicked.id)}
                />
                {index + 1 === channelSlot ? channelBlock : null}
                {index + 1 === playlistSlot ? playlistBlock : null}
              </Fragment>
            ))}
          </div>

          {/* Sentinelle de pagination infinie */}
          <div ref={sentinelRef} aria-hidden="true" className="h-px w-full" />

          {isFetchingNextPage ? (
            <div className="flex justify-center py-8" role="status" aria-live="polite">
              <Spinner size={28} />
              <span className="sr-only">Chargement de résultats supplémentaires…</span>
            </div>
          ) : null}

          {!hasNextPage && videos.length > 0 ? (
            <p className="py-8 text-center text-kt-sm text-fg-muted">
              Fin des résultats
            </p>
          ) : null}
        </>
      )}
    </div>
  );
}
