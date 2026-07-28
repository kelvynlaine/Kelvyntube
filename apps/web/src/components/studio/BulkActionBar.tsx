'use client';

import { useState } from 'react';
import { useMutation, useQuery, useQueryClient } from '@tanstack/react-query';
import { Hash, MessageSquare, Tag, Trash2, X } from 'lucide-react';
import {
  ROUTES,
  type CategoryDTO,
  type VideoVisibility,
} from '@kelvyntube/shared';
import { Button, DropdownMenu, Modal, Select, cn, useToast } from '@kelvyntube/ui';
import { api } from '@/lib/api';
import { TagInput } from './TagInput';
import {
  VISIBILITY_LABELS,
  studioKeys,
  type BulkUpdateResultDTO,
} from './studio-api';

/**
 * ═══════════════════════════════════════════════════════════════════════════
 *  BARRE D'ACTIONS GROUPÉES
 *  Apparaît dès qu'une vidéo est cochée. Les modifications passent par
 *  `POST ROUTES.videos.bulkUpdate` ; la suppression est confirmée puis
 *  appliquée vidéo par vidéo (l'API n'expose pas de suppression en lot).
 * ═══════════════════════════════════════════════════════════════════════════
 */

/** 44 px au doigt, 32 px à la souris (à partir de feed-3, comme l'écran Contenu). */
const BULK_CONTROL_HEIGHT = 'h-11 shrink-0 text-kt-base feed-3:h-8 feed-3:text-kt-sm';

export interface BulkActionBarProps {
  selectedIds: string[];
  onClear: () => void;
  onDone: () => void;
}

export function BulkActionBar({ selectedIds, onClear, onDone }: BulkActionBarProps) {
  const { toast } = useToast();
  const queryClient = useQueryClient();
  const [categoryOpen, setCategoryOpen] = useState(false);
  const [tagsOpen, setTagsOpen] = useState(false);
  const [deleteOpen, setDeleteOpen] = useState(false);
  const [categoryId, setCategoryId] = useState('');
  const [tags, setTags] = useState<string[]>([]);

  const categoriesQuery = useQuery({
    queryKey: studioKeys.categories,
    queryFn: () => api.get<CategoryDTO[]>(ROUTES.feed.categories),
    staleTime: 10 * 60_000,
  });

  const invalidate = () => {
    void queryClient.invalidateQueries({ queryKey: ['studio'] });
    onDone();
  };

  const bulkMutation = useMutation({
    mutationFn: (body: {
      visibility?: VideoVisibility;
      categoryId?: string | null;
      commentsEnabled?: boolean;
      addTags?: string[];
    }) =>
      api.post<BulkUpdateResultDTO>(ROUTES.videos.bulkUpdate, {
        videoIds: selectedIds,
        ...body,
      }),
    onSuccess: (result) => {
      toast({
        message: `${result.updated} vidéo${result.updated > 1 ? 's' : ''} mise${
          result.updated > 1 ? 's' : ''
        } à jour.`,
        variant: 'success',
      });
      invalidate();
    },
    onError: (error: Error) => toast({ message: error.message, variant: 'error' }),
  });

  const deleteMutation = useMutation({
    mutationFn: async () => {
      // Suppression logique, une requête par vidéo (pas d'endpoint en lot).
      const results = await Promise.allSettled(
        selectedIds.map((id) => api.delete(ROUTES.videos.delete(id))),
      );
      const failed = results.filter((r) => r.status === 'rejected').length;
      return { deleted: results.length - failed, failed };
    },
    onSuccess: ({ deleted, failed }) => {
      setDeleteOpen(false);
      toast({
        message: failed
          ? `${deleted} vidéo(s) supprimée(s), ${failed} en échec.`
          : `${deleted} vidéo${deleted > 1 ? 's' : ''} supprimée${deleted > 1 ? 's' : ''}.`,
        variant: failed ? 'error' : 'success',
      });
      invalidate();
    },
    onError: (error: Error) => toast({ message: error.message, variant: 'error' }),
  });

  const busy = bulkMutation.isPending || deleteMutation.isPending;
  const count = selectedIds.length;

  return (
    <>
      {/*
        ── Barre d'actions groupées ─────────────────────────────────────
        Mobile : barre FIXE ancrée en bas de l'écran (au-dessus de la
        safe-area de l'iPhone), pleine largeur, avec une rangée d'actions
        défilable horizontalement — la pilule centrée d'origine se disloquait
        sur cinq lignes à 390 px et poussait la page vers le bas.
        Desktop (feed-3) : on retrouve exactement la pilule collante.
      */}
      <div
        role="region"
        aria-label="Actions groupées"
        className={cn(
          'fixed inset-x-0 bottom-0 z-30 flex flex-col gap-2 border-t border-border bg-bg-elevated',
          'px-3 pb-[max(0.75rem,env(safe-area-inset-bottom))] pt-3 shadow-xl',
          'feed-3:sticky feed-3:inset-x-auto feed-3:bottom-4 feed-3:mx-auto feed-3:w-fit feed-3:max-w-full',
          'feed-3:flex-row feed-3:flex-wrap feed-3:items-center feed-3:rounded-pill feed-3:border',
          'feed-3:px-3 feed-3:py-2',
        )}
      >
        <span className="px-1 text-kt-sm font-medium text-fg">
          {count} sélectionnée{count > 1 ? 's' : ''}
        </span>

        {/*
          `overflow-x-auto` + `flex-nowrap` : les actions restent sur une
          seule rangée que l'on fait défiler du pouce, plutôt que d'empiler
          six boutons et de manger la moitié de l'écran.
        */}
        <div className="kt-no-scrollbar -mx-1 flex flex-nowrap items-center gap-2 overflow-x-auto px-1 pb-0.5 feed-3:mx-0 feed-3:flex-wrap feed-3:overflow-visible feed-3:px-0 feed-3:pb-0">
          <Select
            selectSize="sm"
            aria-label="Changer la visibilité des vidéos sélectionnées"
            placeholder="Visibilité"
            value=""
            disabled={busy}
            onChange={(event) =>
              bulkMutation.mutate({ visibility: event.target.value as VideoVisibility })
            }
            options={(['PUBLIC', 'UNLISTED', 'PRIVATE'] as const).map((value) => ({
              value,
              label: VISIBILITY_LABELS[value],
            }))}
            className={BULK_CONTROL_HEIGHT}
            containerClassName="w-36 shrink-0 feed-3:w-40"
          />

          <Button
            size="sm"
            variant="ghost"
            iconLeft={<Tag size={16} />}
            disabled={busy}
            className={BULK_CONTROL_HEIGHT}
            onClick={() => setCategoryOpen(true)}
          >
            Catégorie
          </Button>

          <Button
            size="sm"
            variant="ghost"
            iconLeft={<Hash size={16} />}
            disabled={busy}
            className={BULK_CONTROL_HEIGHT}
            onClick={() => setTagsOpen(true)}
          >
            Tags
          </Button>

          <DropdownMenu
            side="top"
            align="end"
            label="Commentaires"
            disabled={busy}
            triggerLabel="Activer ou désactiver les commentaires"
            triggerClassName="h-11 shrink-0 gap-2 rounded-pill px-3 text-kt-base text-fg hover:bg-bg-hover feed-3:h-8 feed-3:text-kt-sm"
            trigger={
              <span className="inline-flex items-center gap-2">
                <MessageSquare size={16} aria-hidden="true" />
                Commentaires
              </span>
            }
            items={[
              {
                id: 'on',
                label: 'Activer les commentaires',
                onSelect: () => bulkMutation.mutate({ commentsEnabled: true }),
              },
              {
                id: 'off',
                label: 'Désactiver les commentaires',
                onSelect: () => bulkMutation.mutate({ commentsEnabled: false }),
              },
            ]}
          />

          <Button
            size="sm"
            variant="ghost"
            iconLeft={<Trash2 size={16} />}
            disabled={busy}
            className={cn(BULK_CONTROL_HEIGHT, 'text-danger')}
            onClick={() => setDeleteOpen(true)}
          >
            Supprimer
          </Button>

          <Button
            size="sm"
            variant="ghost"
            iconLeft={<X size={16} />}
            disabled={busy}
            className={BULK_CONTROL_HEIGHT}
            onClick={onClear}
          >
            Désélectionner
          </Button>
        </div>
      </div>

      {/* ── Catégorie ──────────────────────────────────────────────────── */}
      <Modal
        open={categoryOpen}
        onClose={() => setCategoryOpen(false)}
        title="Changer la catégorie"
        description={`La catégorie sera appliquée aux ${count} vidéos sélectionnées.`}
        footer={
          <div className="flex justify-end gap-2">
            <Button variant="ghost" onClick={() => setCategoryOpen(false)}>
              Annuler
            </Button>
            <Button
              variant="primary"
              loading={bulkMutation.isPending}
              disabled={!categoryId}
              onClick={() => {
                bulkMutation.mutate({ categoryId });
                setCategoryOpen(false);
              }}
            >
              Appliquer
            </Button>
          </div>
        }
      >
        <Select
          label="Catégorie"
          placeholder="Choisir une catégorie"
          value={categoryId}
          onChange={(event) => setCategoryId(event.target.value)}
          options={(categoriesQuery.data ?? []).map((category) => ({
            value: category.id,
            label: category.name,
          }))}
        />
      </Modal>

      {/* ── Tags ───────────────────────────────────────────────────────── */}
      <Modal
        open={tagsOpen}
        onClose={() => setTagsOpen(false)}
        title="Ajouter des tags"
        description={`Ces tags seront ajoutés aux ${count} vidéos sélectionnées (les tags existants sont conservés).`}
        footer={
          <div className="flex justify-end gap-2">
            <Button variant="ghost" onClick={() => setTagsOpen(false)}>
              Annuler
            </Button>
            <Button
              variant="primary"
              loading={bulkMutation.isPending}
              disabled={tags.length === 0}
              onClick={() => {
                bulkMutation.mutate({ addTags: tags });
                setTags([]);
                setTagsOpen(false);
              }}
            >
              Ajouter
            </Button>
          </div>
        }
      >
        <TagInput value={tags} onChange={setTags} label="Tags à ajouter" />
      </Modal>

      {/* ── Suppression ────────────────────────────────────────────────── */}
      <Modal
        open={deleteOpen}
        onClose={() => setDeleteOpen(false)}
        size="sm"
        title={`Supprimer ${count} vidéo${count > 1 ? 's' : ''} ?`}
        description="Cette action retire définitivement les vidéos de Kelvyn Tube, ainsi que leurs vues, commentaires et statistiques. Elle est irréversible."
        footer={
          <div className="flex justify-end gap-2">
            <Button variant="ghost" onClick={() => setDeleteOpen(false)}>
              Annuler
            </Button>
            <Button
              variant="brand"
              loading={deleteMutation.isPending}
              onClick={() => deleteMutation.mutate()}
            >
              Supprimer définitivement
            </Button>
          </div>
        }
      >
        <p className="text-kt-base text-fg-muted">
          Tapez sur « Supprimer définitivement » pour confirmer. Aucune restauration n&apos;est
          possible depuis le Studio.
        </p>
      </Modal>
    </>
  );
}
