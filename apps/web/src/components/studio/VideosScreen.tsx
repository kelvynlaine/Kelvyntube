'use client';

import Link from 'next/link';
import { useEffect, useMemo, useState } from 'react';
import { useMutation, useQuery, useQueryClient } from '@tanstack/react-query';
import { ChevronLeft, ChevronRight, Search, Upload, Video } from 'lucide-react';
import {
  ROUTES,
  type OffsetPage,
  type StudioVideoRowDTO,
  type VideoStatus,
  type VideoVisibility,
} from '@kelvyntube/shared';
import {
  Button,
  Checkbox,
  EmptyState,
  Input,
  Modal,
  Select,
  Skeleton,
  cn,
  useToast,
} from '@kelvyntube/ui';
import { api } from '@/lib/api';
import { PATHS } from '@/lib/nav';
import { BulkActionBar } from './BulkActionBar';
import { VideoListCard } from './VideoListCard';
import { VideoTableRow } from './VideoTableRow';
import {
  STATUS_LABELS,
  VISIBILITY_LABELS,
  studioKeys,
  type StudioVideoRowExtraDTO,
} from './studio-api';
import { useChannelId, useStudioUrlState } from './useStudioUrlState';

/**
 * ═══════════════════════════════════════════════════════════════════════════
 *  CONTENU — tableau de gestion des vidéos
 *  Recherche débouncée, filtres, tri, pagination par offset et actions
 *  groupées. Tout l'état vit dans l'URL : un écran filtré est partageable.
 * ═══════════════════════════════════════════════════════════════════════════
 */

const SORT_OPTIONS = [
  { value: 'recent', label: 'Les plus récentes' },
  { value: 'views', label: 'Les plus vues' },
  { value: 'likes', label: 'Les plus aimées' },
  { value: 'comments', label: 'Les plus commentées' },
  { value: 'ctr', label: 'Meilleur CTR' },
];

const PAGE_SIZES = [10, 25, 50, 100];

const STATUS_VALUES: VideoStatus[] = [
  'READY',
  'PROCESSING',
  'UPLOADING',
  'UPLOADED',
  'FAILED',
];

const VISIBILITY_VALUES: VideoVisibility[] = ['PUBLIC', 'UNLISTED', 'PRIVATE', 'SCHEDULED'];

/**
 * Les contrôles `sm` du design system font 32 px de haut : confortable à la
 * souris, sous la cible tactile de 44 px au doigt. On les rehausse jusqu'à
 * `feed-3`, seuil auquel l'écran Contenu repasse en mode tableau/desktop.
 */
const MOBILE_CONTROL_HEIGHT = 'h-11 text-kt-base feed-3:h-8 feed-3:text-kt-sm';

const COLUMNS = [
  { key: 'video', label: 'Vidéo', className: 'text-left' },
  { key: 'visibility', label: 'Visibilité', className: 'text-left' },
  { key: 'date', label: 'Date', className: 'text-left' },
  { key: 'views', label: 'Vues', className: 'text-right' },
  { key: 'comments', label: 'Commentaires', className: 'text-right' },
  { key: 'likes', label: "J'aime vs J'aime pas", className: 'text-left' },
  { key: 'ctr', label: 'CTR', className: 'text-right' },
  { key: 'retention', label: 'Rétention moyenne', className: 'text-right' },
];

export function VideosScreen() {
  const channelId = useChannelId();
  const { get, setQuery } = useStudioUrlState();
  const { toast } = useToast();
  const queryClient = useQueryClient();

  const q = get('q') ?? '';
  const status = get('status') ?? '';
  const visibility = get('visibility') ?? '';
  const sort = get('sort') ?? 'recent';
  const page = Math.max(1, Number(get('page') ?? 1) || 1);
  const pageSize = PAGE_SIZES.includes(Number(get('pageSize'))) ? Number(get('pageSize')) : 25;

  // ── Recherche débouncée ────────────────────────────────────────────────
  const [searchDraft, setSearchDraft] = useState(q);
  useEffect(() => setSearchDraft(q), [q]);
  useEffect(() => {
    if (searchDraft === q) return;
    const timer = setTimeout(
      () => setQuery({ q: searchDraft || null }, { resetPage: true }),
      350,
    );
    return () => clearTimeout(timer);
  }, [searchDraft, q, setQuery]);

  // ── Données ────────────────────────────────────────────────────────────
  const filters = useMemo(
    () => ({ q, status, visibility, sort, page, pageSize }),
    [q, status, visibility, sort, page, pageSize],
  );

  const videosQuery = useQuery({
    queryKey: studioKeys.videos(channelId, filters),
    queryFn: () =>
      api.get<OffsetPage<StudioVideoRowDTO & StudioVideoRowExtraDTO>>(
        ROUTES.studio.videos(channelId),
        {
          query: {
            page,
            pageSize,
            sort,
            ...(q ? { q } : {}),
            ...(status ? { status } : {}),
            ...(visibility ? { visibility } : {}),
          },
        },
      ),
    enabled: Boolean(channelId),
  });

  const items = videosQuery.data?.items ?? [];
  const total = videosQuery.data?.total ?? 0;
  const totalPages = videosQuery.data?.totalPages ?? 1;

  // ── Sélection multiple ─────────────────────────────────────────────────
  const [selected, setSelected] = useState<string[]>([]);

  // Un changement de filtre ou de page invalide la sélection courante.
  useEffect(() => {
    setSelected([]);
  }, [q, status, visibility, sort, page, pageSize]);

  const visibleIds = items.map((item) => item.id);
  const allSelected = visibleIds.length > 0 && visibleIds.every((id) => selected.includes(id));
  const someSelected = selected.length > 0 && !allSelected;

  const toggleSelect = (videoId: string, next: boolean) =>
    setSelected((previous) =>
      next ? [...new Set([...previous, videoId])] : previous.filter((id) => id !== videoId),
    );

  const toggleAll = (next: boolean) => setSelected(next ? visibleIds : []);

  // ── Suppression unitaire ───────────────────────────────────────────────
  const [pendingDelete, setPendingDelete] = useState<StudioVideoRowDTO | null>(null);

  const deleteMutation = useMutation({
    mutationFn: (videoId: string) => api.delete(ROUTES.videos.delete(videoId)),
    onSuccess: () => {
      toast({ message: 'Vidéo supprimée.', variant: 'success' });
      setPendingDelete(null);
      void queryClient.invalidateQueries({ queryKey: ['studio'] });
    },
    onError: (error: Error) => toast({ message: error.message, variant: 'error' }),
  });

  const rangeStart = total === 0 ? 0 : (page - 1) * pageSize + 1;
  const rangeEnd = Math.min(page * pageSize, total);

  return (
    <div
      className={cn(
        'flex flex-col gap-4',
        // La barre d'actions groupées est FIXE en bas d'écran sur mobile :
        // on réserve la place, sinon elle masquerait la dernière carte.
        selected.length > 0 && 'pb-28 feed-3:pb-0',
      )}
    >
      {/* ── En-tête ───────────────────────────────────────────────────── */}
      <div className="flex flex-wrap items-center justify-between gap-3">
        <h2 className="text-kt-lg font-medium text-fg">Contenu de la chaîne</h2>
        <Link
          href={PATHS.studioUpload(channelId)}
          className={cn(
            'inline-flex h-11 items-center gap-2 rounded-pill bg-brand px-4 feed-3:h-9',
            'text-kt-base font-medium text-white transition-colors hover:bg-brand-hover kt-focus-ring',
          )}
        >
          <Upload size={16} aria-hidden="true" />
          Mettre en ligne
        </Link>
      </div>

      {/*
        ── Filtres ─────────────────────────────────────────────────────
        Grille plutôt que `flex-wrap` : à 320 px les trois listes tiennent
        chacune sur sa ligne, à 480 px elles se rangent deux par deux, et le
        desktop retrouve la rangée d'origine. Les contrôles font 44 px de haut
        tant que la souris n'a pas repris la main (feed-3).
      */}
      <div className="grid grid-cols-1 items-end gap-3 rounded-kt border border-border bg-bg-elevated p-3 xs:grid-cols-2 feed-3:flex feed-3:flex-wrap">
        <Input
          label="Rechercher"
          inputSize="sm"
          placeholder="Titre de la vidéo…"
          value={searchDraft}
          iconLeft={<Search size={16} aria-hidden="true" />}
          onChange={(event) => setSearchDraft(event.target.value)}
          className={MOBILE_CONTROL_HEIGHT}
          containerClassName="xs:col-span-2 feed-3:min-w-[14rem] feed-3:flex-1"
        />
        <Select
          label="Statut"
          selectSize="sm"
          value={status}
          onChange={(event) => setQuery({ status: event.target.value }, { resetPage: true })}
          className={MOBILE_CONTROL_HEIGHT}
          containerClassName="feed-3:w-44"
        >
          <option value="">Tous les statuts</option>
          {STATUS_VALUES.map((value) => (
            <option key={value} value={value}>
              {STATUS_LABELS[value]}
            </option>
          ))}
        </Select>
        <Select
          label="Visibilité"
          selectSize="sm"
          value={visibility}
          onChange={(event) => setQuery({ visibility: event.target.value }, { resetPage: true })}
          className={MOBILE_CONTROL_HEIGHT}
          containerClassName="feed-3:w-44"
        >
          <option value="">Toutes</option>
          {VISIBILITY_VALUES.map((value) => (
            <option key={value} value={value}>
              {VISIBILITY_LABELS[value]}
            </option>
          ))}
        </Select>
        <Select
          label="Trier par"
          selectSize="sm"
          value={sort}
          options={SORT_OPTIONS}
          onChange={(event) => setQuery({ sort: event.target.value }, { resetPage: true })}
          className={MOBILE_CONTROL_HEIGHT}
          containerClassName="xs:col-span-2 feed-3:col-span-1 feed-3:w-48"
        />
      </div>

      {/* ── Tableau ───────────────────────────────────────────────────── */}
      {videosQuery.isPending ? (
        <div className="flex flex-col gap-2">
          {Array.from({ length: 6 }).map((_, index) => (
            <Skeleton key={index} variant="rect" className="h-24 w-full rounded-kt" />
          ))}
        </div>
      ) : videosQuery.isError ? (
        <EmptyState
          icon={<Video size={36} aria-hidden="true" />}
          title="Chargement impossible"
          description="La liste de vos vidéos n'a pas pu être récupérée. Réessayez dans un instant."
          action={<Button onClick={() => void videosQuery.refetch()}>Réessayer</Button>}
        />
      ) : items.length === 0 ? (
        <EmptyState
          icon={<Video size={36} aria-hidden="true" />}
          title={q || status || visibility ? 'Aucun résultat' : 'Aucune vidéo pour le moment'}
          description={
            q || status || visibility
              ? 'Aucune vidéo ne correspond à ces filtres. Essayez de les élargir.'
              : 'Mettez en ligne votre première vidéo pour la retrouver ici.'
          }
          action={
            q || status || visibility ? (
              <Button
                onClick={() =>
                  setQuery({ q: null, status: null, visibility: null }, { resetPage: true })
                }
              >
                Réinitialiser les filtres
              </Button>
            ) : (
              <Link
                href={PATHS.studioUpload(channelId)}
                className={cn(
                  'inline-flex h-11 items-center rounded-pill bg-brand px-4 feed-3:h-9',
                  'text-kt-base font-medium text-white hover:bg-brand-hover kt-focus-ring',
                )}
              >
                Mettre en ligne
              </Link>
            )
          }
        />
      ) : (
        <>
          {/*
            En mobile, la case « tout sélectionner » de l'en-tête de tableau
            n'existe plus : on la réexpose au-dessus de la liste de cartes,
            sinon la sélection multiple deviendrait fastidieuse au doigt.
          */}
          <label className="flex min-h-11 cursor-pointer items-center gap-3 px-1 feed-3:hidden">
            <Checkbox
              checked={allSelected}
              ref={(element) => {
                if (element) element.indeterminate = someSelected;
              }}
              onChange={(event) => toggleAll(event.target.checked)}
              aria-label="Sélectionner toutes les vidéos de la page"
            />
            <span className="text-kt-sm text-fg-muted">
              {selected.length > 0
                ? `${selected.length} sélectionnée${selected.length > 1 ? 's' : ''}`
                : 'Tout sélectionner'}
            </span>
          </label>

          {/*
            ── Rendu MOBILE : liste de cartes (sous feed-3 / 900 px) ──────
            Le tableau ci-dessous impose 1088 px de large. En dessous de
            900 px on le remplace par des cartes : mêmes données, même
            sélection, mêmes actions, sans scroll horizontal.
          */}
          <ul className="flex flex-col gap-3 feed-3:hidden">
            {items.map((video) => (
              <VideoListCard
                key={video.id}
                video={video}
                channelId={channelId}
                selected={selected.includes(video.id)}
                onToggleSelect={toggleSelect}
                onRequestDelete={setPendingDelete}
                onChanged={() => setSelected([])}
              />
            ))}
          </ul>

          {/*
            ── Rendu DESKTOP : tableau complet, inchangé ─────────────────
            `relative` est indispensable : les libellés `sr-only` du tableau
            (la légende, le « Actions » de la dernière colonne) sont en
            `position: absolute`. Sans ancêtre positionné, leur bloc conteneur
            est le bloc initial — ils sortaient donc du conteneur à défilement
            et allongeaient la page ENTIÈRE de plusieurs dizaines de pixels
            entre 900 et 1088 px de large. `relative` les rattache au
            conteneur, qui les rogne comme le reste du tableau.
          */}
          <div className="kt-scroll relative hidden overflow-x-auto rounded-kt border border-border feed-3:block">
            <table className="w-full min-w-[68rem] border-collapse text-kt-base">
              <caption className="sr-only">
                Vidéos de la chaîne, avec leur visibilité et leurs statistiques
              </caption>
              <thead>
                <tr className="border-b border-border bg-bg-elevated text-kt-sm text-fg-muted">
                  <th scope="col" className="px-2 py-2">
                    <Checkbox
                      checked={allSelected}
                      ref={(element) => {
                        if (element) element.indeterminate = someSelected;
                      }}
                      onChange={(event) => toggleAll(event.target.checked)}
                      aria-label="Sélectionner toutes les vidéos de la page"
                    />
                  </th>
                  {COLUMNS.map((column) => (
                    <th
                      key={column.key}
                      scope="col"
                      className={cn('px-2 py-2 font-medium', column.className)}
                    >
                      {column.label}
                    </th>
                  ))}
                  <th scope="col" className="px-2 py-2">
                    <span className="sr-only">Actions</span>
                  </th>
                </tr>
              </thead>
              <tbody>
                {items.map((video) => (
                  <VideoTableRow
                    key={video.id}
                    video={video}
                    channelId={channelId}
                    selected={selected.includes(video.id)}
                    onToggleSelect={toggleSelect}
                    onRequestDelete={setPendingDelete}
                    onChanged={() => setSelected([])}
                  />
                ))}
              </tbody>
            </table>
          </div>
        </>
      )}

      {/* ── Pagination ────────────────────────────────────────────────── */}
      {items.length > 0 ? (
        <nav
          aria-label="Pagination des vidéos"
          className="flex flex-wrap items-center justify-between gap-3"
        >
          <p className="text-kt-sm text-fg-muted" aria-live="polite">
            {rangeStart}–{rangeEnd} sur {total}
          </p>

          <div className="flex w-full flex-wrap items-center justify-between gap-3 feed-3:w-auto feed-3:justify-end">
            <Select
              label="Par page"
              selectSize="sm"
              value={String(pageSize)}
              options={PAGE_SIZES.map((size) => ({ value: String(size), label: String(size) }))}
              onChange={(event) =>
                setQuery({ pageSize: event.target.value }, { resetPage: true })
              }
              className={MOBILE_CONTROL_HEIGHT}
              // Plus large en mobile : le libellé « Par page » ne doit pas se
              // couper en deux lignes à côté d'un contrôle de 44 px de haut.
              containerClassName="w-40 flex-row items-center gap-2 feed-3:w-28"
            />
            <div className="flex items-center gap-1">
              <Button
                size="sm"
                variant="ghost"
                iconLeft={<ChevronLeft size={16} />}
                disabled={page <= 1}
                className={MOBILE_CONTROL_HEIGHT}
                onClick={() => setQuery({ page: page - 1 })}
              >
                Précédent
              </Button>
              <span className="px-2 text-kt-sm tabular-nums text-fg-muted">
                {page} / {totalPages}
              </span>
              <Button
                size="sm"
                variant="ghost"
                iconRight={<ChevronRight size={16} />}
                disabled={page >= totalPages}
                className={MOBILE_CONTROL_HEIGHT}
                onClick={() => setQuery({ page: page + 1 })}
              >
                Suivant
              </Button>
            </div>
          </div>
        </nav>
      ) : null}

      {/* ── Actions groupées ──────────────────────────────────────────── */}
      {selected.length > 0 ? (
        <BulkActionBar
          selectedIds={selected}
          onClear={() => setSelected([])}
          onDone={() => setSelected([])}
        />
      ) : null}

      {/* ── Confirmation de suppression unitaire ──────────────────────── */}
      <Modal
        open={pendingDelete !== null}
        onClose={() => setPendingDelete(null)}
        size="sm"
        title="Supprimer cette vidéo ?"
        description={pendingDelete ? `« ${pendingDelete.title} »` : undefined}
        footer={
          <div className="flex justify-end gap-2">
            <Button variant="ghost" onClick={() => setPendingDelete(null)}>
              Annuler
            </Button>
            <Button
              variant="brand"
              loading={deleteMutation.isPending}
              onClick={() => pendingDelete && deleteMutation.mutate(pendingDelete.id)}
            >
              Supprimer définitivement
            </Button>
          </div>
        }
      >
        <p className="text-kt-base text-fg-muted">
          La vidéo, ses vues, ses commentaires et ses statistiques seront retirés de Kelvyn Tube.
          Cette action est irréversible.
        </p>
      </Modal>
    </div>
  );
}
