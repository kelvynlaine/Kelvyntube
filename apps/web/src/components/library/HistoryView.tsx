'use client';

import Link from 'next/link';
import { useRouter, useSearchParams } from 'next/navigation';
import { useMutation, useQueryClient, type InfiniteData } from '@tanstack/react-query';
import { History, PauseCircle, Search, Trash2, X } from 'lucide-react';
import { useEffect, useMemo, useState } from 'react';
import { ROUTES, type CursorPage } from '@kelvyntube/shared';
import {
  Button,
  EmptyState,
  IconButton,
  Input,
  Modal,
  Switch,
  VideoCard,
  VideoCardSkeleton,
} from '@kelvyntube/ui';
import { api } from '@/lib/api';
import { PATHS } from '@/lib/nav';
import {
  InfiniteSentinel,
  LibraryAuthGate,
  LibraryPage,
  VideoListSkeleton,
} from './LibraryShell';
import {
  useDebouncedValue,
  useLibraryToast,
  useLocalStorageState,
} from './hooks';
import { flattenPages, libraryKeys, useHistory, type HistoryItemDTO } from './queries';

/**
 * ═══════════════════════════════════════════════════════════════════════════
 *  PAGE « HISTORIQUE »
 *  Liste verticale groupée par jour (en-têtes collants), recherche débouncée,
 *  suppression optimiste élément par élément et pagination infinie.
 * ═══════════════════════════════════════════════════════════════════════════
 */
export function HistoryView() {
  return (
    <LibraryAuthGate
      icon={<History size={28} aria-hidden="true" />}
      title="Gardez la trace de ce que vous regardez"
      description="Connectez-vous pour consulter et gérer votre historique de visionnage."
      skeleton="list"
    >
      <HistoryContent />
    </LibraryAuthGate>
  );
}

/** Clé de regroupement : une entrée par journée civile. */
function dayKey(iso: string): string {
  const date = new Date(iso);
  return `${date.getFullYear()}-${date.getMonth()}-${date.getDate()}`;
}

/** « Aujourd'hui », « Hier », sinon la date longue en français. */
function dayLabel(iso: string): string {
  const date = new Date(iso);
  const today = new Date();
  const yesterday = new Date(today);
  yesterday.setDate(today.getDate() - 1);

  if (date.toDateString() === today.toDateString()) return "Aujourd'hui";
  if (date.toDateString() === yesterday.toDateString()) return 'Hier';

  return new Intl.DateTimeFormat('fr-FR', {
    weekday: 'long',
    day: 'numeric',
    month: 'long',
    year: 'numeric',
  }).format(date);
}

interface DayGroup {
  key: string;
  label: string;
  items: HistoryItemDTO[];
}

function groupByDay(items: HistoryItemDTO[]): DayGroup[] {
  const groups: DayGroup[] = [];
  for (const item of items) {
    const key = dayKey(item.watchedAt);
    const last = groups[groups.length - 1];
    if (last && last.key === key) last.items.push(item);
    else groups.push({ key, label: dayLabel(item.watchedAt), items: [item] });
  }
  return groups;
}

function HistoryContent() {
  const router = useRouter();
  const searchParams = useSearchParams();
  const queryClient = useQueryClient();
  const toast = useLibraryToast();

  // ── Recherche (?q=) avec débounce de 400 ms ────────────────────────────
  const [input, setInput] = useState(() => searchParams.get('q') ?? '');
  const search = useDebouncedValue(input.trim(), 400);

  useEffect(() => {
    const target = search
      ? `${PATHS.history}?q=${encodeURIComponent(search)}`
      : PATHS.history;
    router.replace(target, { scroll: false });
  }, [search, router]);

  const historyQuery = useHistory(search);
  const items = flattenPages(historyQuery.data);
  const groups = useMemo(() => groupByDay(items), [items]);

  const queryKey = libraryKeys.history(search);

  // ── Suppression optimiste d'une entrée ─────────────────────────────────
  const removeOne = useMutation({
    mutationFn: (videoId: string) =>
      api.delete<{ deleted: number }>(ROUTES.library.clearHistory, {
        query: { videoId },
      }),
    onMutate: async (videoId: string) => {
      await queryClient.cancelQueries({ queryKey });
      const previous =
        queryClient.getQueryData<InfiniteData<CursorPage<HistoryItemDTO>>>(queryKey);

      queryClient.setQueryData<InfiniteData<CursorPage<HistoryItemDTO>>>(
        queryKey,
        (old) =>
          old && {
            ...old,
            pages: old.pages.map((page) => ({
              ...page,
              items: page.items.filter((item) => item.id !== videoId),
            })),
          },
      );

      return { previous };
    },
    // Retour arrière si l'API refuse la suppression
    onError: (_error, _videoId, context) => {
      if (context?.previous) queryClient.setQueryData(queryKey, context.previous);
      toast({ message: 'Suppression impossible', variant: 'error' });
    },
    onSuccess: () => {
      toast({ message: 'Vidéo retirée de l’historique' });
    },
  });

  // ── Effacer tout l'historique ──────────────────────────────────────────
  const [confirmOpen, setConfirmOpen] = useState(false);

  const clearAll = useMutation({
    mutationFn: () => api.delete<{ deleted: number }>(ROUTES.library.clearHistory),
    onSuccess: () => {
      void queryClient.invalidateQueries({ queryKey: libraryKeys.historyRoot });
      setConfirmOpen(false);
      toast({ message: 'Historique effacé', variant: 'success' });
    },
    onError: () => {
      toast({ message: 'Impossible d’effacer l’historique', variant: 'error' });
    },
  });

  const isEmpty = !historyQuery.isLoading && items.length === 0;

  return (
    <LibraryPage>
      <div className="flex flex-col-reverse gap-8 lg:flex-row lg:items-start">
        {/* ── Colonne principale ──────────────────────────────────────── */}
        <div className="min-w-0 flex-1">
          <h1 className="mb-6 flex items-center gap-3 text-kt-xl font-medium text-fg">
            <History size={24} aria-hidden="true" className="text-fg-muted" />
            Historique
          </h1>

          {historyQuery.isLoading ? <VideoListSkeleton /> : null}

          {isEmpty ? (
            <EmptyState
              icon={<History size={28} aria-hidden="true" />}
              title={
                search
                  ? 'Aucun résultat dans votre historique'
                  : 'Votre historique est vide'
              }
              description={
                search
                  ? 'Essayez un autre mot-clé.'
                  : 'Les vidéos que vous regardez apparaîtront ici.'
              }
              action={
                <Link href={PATHS.home} className="kt-btn-primary h-9 px-4">
                  Découvrir des vidéos
                </Link>
              }
            />
          ) : null}

          <div className="flex flex-col gap-6">
            {groups.map((group) => (
              <section key={group.key} aria-label={group.label}>
                {/* En-tête collant du jour */}
                {/* `top-topbar` : la barre supérieure fixe mesure 56 px */}
                <h2 className="sticky top-topbar z-10 -mx-2 mb-3 bg-bg/95 px-2 py-2 text-kt-md font-medium text-fg backdrop-blur">
                  {group.label}
                </h2>

                <ul className="flex flex-col gap-4">
                  {group.items.map((video) => (
                    <li
                      key={`${group.key}-${video.id}`}
                      className="group/row flex items-start gap-2"
                    >
                      <VideoCard
                        video={video}
                        layout="list"
                        linkComponent={Link}
                        className="min-w-0 flex-1"
                      />
                      <IconButton
                        size="sm"
                        aria-label={`Retirer « ${video.title} » de l'historique`}
                        onClick={() => removeOne.mutate(video.id)}
                        className="opacity-0 transition-opacity focus-visible:opacity-100 group-hover/row:opacity-100"
                      >
                        <X size={18} />
                      </IconButton>
                    </li>
                  ))}
                </ul>
              </section>
            ))}
          </div>

          <InfiniteSentinel
            hasMore={Boolean(historyQuery.hasNextPage)}
            loading={historyQuery.isFetchingNextPage}
            onLoadMore={() => void historyQuery.fetchNextPage()}
          >
            <div className="flex flex-col gap-4" aria-hidden="true">
              {Array.from({ length: 3 }, (_, index) => (
                <VideoCardSkeleton key={index} layout="list" />
              ))}
            </div>
          </InfiniteSentinel>
        </div>

        {/* ── Panneau latéral droit ───────────────────────────────────── */}
        <aside className="w-full shrink-0 lg:sticky lg:top-[72px] lg:w-[300px]">
          <div className="flex flex-col gap-4">
            <Input
              type="search"
              label="Rechercher dans l'historique"
              placeholder="Rechercher…"
              value={input}
              onChange={(event) => setInput(event.target.value)}
              iconLeft={<Search size={16} aria-hidden="true" />}
            />

            <Button
              variant="ghost"
              fullWidth
              className="justify-start"
              iconLeft={<Trash2 size={18} aria-hidden="true" />}
              onClick={() => setConfirmOpen(true)}
            >
              Effacer tout l'historique
            </Button>

            <PauseHistoryToggle />
          </div>
        </aside>
      </div>

      <Modal
        open={confirmOpen}
        onClose={() => setConfirmOpen(false)}
        title="Effacer tout l'historique ?"
        description="Les vidéos déjà regardées ne seront plus recommandées de la même manière. Cette action est définitive."
        size="sm"
        footer={
          <>
            <Button variant="ghost" onClick={() => setConfirmOpen(false)}>
              Annuler
            </Button>
            <Button
              variant="brand"
              loading={clearAll.isPending}
              onClick={() => clearAll.mutate()}
            >
              Effacer
            </Button>
          </>
        }
      >
        <p className="text-kt-base text-fg-muted">
          Votre historique de visionnage sera intégralement supprimé de votre
          compte Kelvyn Tube.
        </p>
      </Modal>
    </LibraryPage>
  );
}

/**
 * Bascule « Suspendre l'historique ».
 * Préférence PUREMENT LOCALE et VISUELLE : elle est persistée dans
 * `localStorage` et n'est jamais envoyée à l'API — le serveur continue
 * d'enregistrer les visionnages. Elle sert de rappel visuel à l'utilisateur
 * en attendant l'endpoint dédié côté API.
 */
function PauseHistoryToggle() {
  const [paused, setPaused] = useLocalStorageState<boolean>(
    'kt:history-paused',
    false,
  );

  return (
    <div className="flex flex-col gap-2 rounded-kt bg-bg-elevated p-4">
      <Switch
        checked={paused}
        onCheckedChange={setPaused}
        label={
          <span className="flex items-center gap-2">
            <PauseCircle size={18} aria-hidden="true" />
            Suspendre l'historique
          </span>
        }
        description="Préférence locale à cet appareil."
      />
    </div>
  );
}
