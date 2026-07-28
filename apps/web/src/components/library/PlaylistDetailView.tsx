'use client';

import Link from 'next/link';
import { useRouter, useSearchParams } from 'next/navigation';
import { useMutation, useQueryClient } from '@tanstack/react-query';
import { ListVideo, MoreVertical, Pencil, Trash2 } from 'lucide-react';
import { useCallback, useState, type FormEvent } from 'react';
import {
  ROUTES,
  reorderPlaylistSchema,
  updatePlaylistSchema,
  type PlaylistDetailDTO,
  type PlaylistSummaryDTO,
  type VideoVisibility,
} from '@kelvyntube/shared';
import {
  Button,
  DropdownMenu,
  EmptyState,
  IconButton,
  Input,
  Modal,
  Select,
  Textarea,
  VideoCardSkeleton,
} from '@kelvyntube/ui';
import { ApiClientError, api } from '@/lib/api';
import { PATHS } from '@/lib/nav';
import { LibraryAuthGate, LibraryPage, LibrarySkeleton } from './LibraryShell';
import { PlaylistHero, PlaylistLayout } from './PlaylistHero';
import { PlaylistItemList } from './PlaylistItemList';
import { useLibraryToast } from './hooks';
import { libraryKeys, usePlaylistDetail, usePlaylists } from './queries';
import { isSystemPlaylist, VISIBILITY_OPTIONS } from './playlist-utils';

/**
 * ═══════════════════════════════════════════════════════════════════════════
 *  PAGE « DÉTAIL D'UNE PLAYLIST » — /playlist?list=<id>
 *  Propriétaire : édition en ligne, glisser-déposer accessible, retrait
 *  d'éléments et suppression (interdite sur les playlists système).
 * ═══════════════════════════════════════════════════════════════════════════
 */
export function PlaylistDetailView() {
  return (
    <LibraryAuthGate
      icon={<ListVideo size={28} aria-hidden="true" />}
      title="Playlist"
      description="Connectez-vous pour consulter cette playlist."
      skeleton="playlist"
    >
      <PlaylistDetailContent />
    </LibraryAuthGate>
  );
}

function PlaylistDetailContent() {
  const router = useRouter();
  const searchParams = useSearchParams();
  const queryClient = useQueryClient();
  const toast = useLibraryToast();

  const playlistId = searchParams.get('list');
  const detailQuery = usePlaylistDetail(playlistId);
  const playlists = usePlaylists();

  const [editing, setEditing] = useState(false);
  const [confirmDelete, setConfirmDelete] = useState(false);

  const detail = detailQuery.data;
  const queryKey = libraryKeys.playlist(playlistId ?? '');

  /**
   * `GET /playlists` ne renvoie que les playlists de l'utilisateur :
   * y trouver l'identifiant courant suffit à établir la propriété, y compris
   * pour les playlists système (dont `owner` est null).
   */
  const isOwner = Boolean(
    playlistId && playlists.data?.some((playlist) => playlist.id === playlistId),
  );
  const canEdit = isOwner && detail !== undefined;

  // ── Réorganisation (optimiste) ─────────────────────────────────────────
  const reorder = useMutation({
    mutationFn: (input: { videoId: string; position: number }) =>
      api.post<PlaylistDetailDTO>(
        ROUTES.playlists.reorder(playlistId as string),
        reorderPlaylistSchema.parse(input),
      ),
    onMutate: async ({ videoId, position }) => {
      await queryClient.cancelQueries({ queryKey });
      const previous = queryClient.getQueryData<PlaylistDetailDTO>(queryKey);

      if (previous) {
        const items = [...previous.items];
        const from = items.findIndex((item) => item.id === videoId);
        if (from !== -1) {
          const [moved] = items.splice(from, 1);
          items.splice(Math.min(position, items.length), 0, moved);
          queryClient.setQueryData<PlaylistDetailDTO>(queryKey, {
            ...previous,
            items: items.map((item, index) => ({ ...item, position: index })),
          });
        }
      }

      return { previous };
    },
    onError: (_error, _input, context) => {
      if (context?.previous) queryClient.setQueryData(queryKey, context.previous);
      toast({ message: 'Réorganisation impossible', variant: 'error' });
    },
    onSuccess: (fresh) => queryClient.setQueryData(queryKey, fresh),
    onSettled: () => {
      void queryClient.invalidateQueries({ queryKey: libraryKeys.playlists });
    },
  });

  // ── Retrait d'un élément (optimiste) ───────────────────────────────────
  const removeItem = useMutation({
    mutationFn: (videoId: string) =>
      api.delete<PlaylistDetailDTO>(
        ROUTES.playlists.removeItem(playlistId as string, videoId),
      ),
    onMutate: async (videoId) => {
      await queryClient.cancelQueries({ queryKey });
      const previous = queryClient.getQueryData<PlaylistDetailDTO>(queryKey);

      if (previous) {
        queryClient.setQueryData<PlaylistDetailDTO>(queryKey, {
          ...previous,
          itemCount: Math.max(0, previous.itemCount - 1),
          items: previous.items
            .filter((item) => item.id !== videoId)
            .map((item, index) => ({ ...item, position: index })),
        });
      }

      return { previous };
    },
    onError: (_error, _videoId, context) => {
      if (context?.previous) queryClient.setQueryData(queryKey, context.previous);
      toast({ message: 'Retrait impossible', variant: 'error' });
    },
    onSuccess: (fresh) => {
      queryClient.setQueryData(queryKey, fresh);
      toast({ message: 'Vidéo retirée de la playlist' });
    },
    onSettled: () => {
      void queryClient.invalidateQueries({ queryKey: libraryKeys.playlists });
    },
  });

  // ── Suppression de la playlist ─────────────────────────────────────────
  const deletePlaylist = useMutation({
    mutationFn: () =>
      api.delete<{ deleted: true }>(ROUTES.playlists.delete(playlistId as string)),
    onSuccess: () => {
      void queryClient.invalidateQueries({ queryKey: libraryKeys.playlists });
      toast({ message: 'Playlist supprimée', variant: 'success' });
      router.push(PATHS.playlists);
    },
    onError: () => toast({ message: 'Suppression impossible', variant: 'error' }),
  });

  const handleReorder = useCallback(
    (videoId: string, position: number) => reorder.mutate({ videoId, position }),
    [reorder],
  );

  // ── Rendus dégradés ────────────────────────────────────────────────────
  if (!playlistId) {
    return (
      <LibraryPage>
        <EmptyState
          icon={<ListVideo size={28} aria-hidden="true" />}
          title="Playlist introuvable"
          description="Le lien ne contient pas d'identifiant de playlist."
          action={
            <Link href={PATHS.playlists} className="kt-btn-primary h-9 px-4">
              Voir mes playlists
            </Link>
          }
        />
      </LibraryPage>
    );
  }

  if (detailQuery.isLoading) return <LibrarySkeleton variant="playlist" />;

  if (detailQuery.isError || !detail) {
    const notFound =
      detailQuery.error instanceof ApiClientError && detailQuery.error.status === 404;
    return (
      <LibraryPage>
        <EmptyState
          icon={<ListVideo size={28} aria-hidden="true" />}
          title={notFound ? 'Playlist introuvable' : 'Chargement impossible'}
          description={
            notFound
              ? 'Cette playlist a été supprimée ou n’est pas accessible.'
              : 'Réessayez dans quelques instants.'
          }
          action={
            <Link href={PATHS.playlists} className="kt-btn-primary h-9 px-4">
              Voir mes playlists
            </Link>
          }
        />
      </LibraryPage>
    );
  }

  const first = detail.items[0];
  const deletable = canEdit && !isSystemPlaylist(detail.kind);

  /** Lecture aléatoire : destination tirée au sort au moment du clic. */
  const shuffle = () => {
    if (detail.items.length === 0) return;
    const random = detail.items[Math.floor(Math.random() * detail.items.length)];
    router.push(PATHS.watch(random.id, { list: detail.id }));
  };

  return (
    <LibraryPage>
      <PlaylistLayout
        hero={
          <PlaylistHero
            title={detail.title}
            description={detail.description}
            kind={detail.kind}
            visibility={detail.visibility}
            itemCount={detail.itemCount}
            thumbnailUrl={first?.thumbnailUrl ?? detail.thumbnailUrl}
            ownerName={detail.owner?.name ?? null}
            playAllHref={first ? PATHS.watch(first.id, { list: detail.id }) : null}
            onShuffle={shuffle}
            actions={
              // Une playlist système ne s'édite ni ne se supprime : pas de menu.
              deletable ? (
                <DropdownMenu
                  align="end"
                  label="Actions sur la playlist"
                  items={[
                    {
                      id: 'edit',
                      label: 'Modifier les informations',
                      icon: <Pencil size={18} />,
                      onSelect: () => setEditing(true),
                    },
                    {
                      id: 'delete',
                      label: 'Supprimer la playlist',
                      icon: <Trash2 size={18} />,
                      danger: true,
                      onSelect: () => setConfirmDelete(true),
                    },
                  ]}
                  trigger={(triggerProps) => (
                    <IconButton {...triggerProps} size="sm" aria-label="Plus d'actions">
                      <MoreVertical size={18} />
                    </IconButton>
                  )}
                />
              ) : null
            }
            editing={
              editing ? (
                <PlaylistEditForm
                  detail={detail}
                  onDone={() => setEditing(false)}
                  queryKey={queryKey}
                />
              ) : undefined
            }
          />
        }
      >
        <PlaylistItemList
          items={detail.items}
          listId={detail.id}
          editable={canEdit}
          onReorder={handleReorder}
          onRemove={(videoId) => removeItem.mutate(videoId)}
          empty={
            <EmptyState
              icon={<ListVideo size={28} aria-hidden="true" />}
              title="Cette playlist est vide"
              description="Ajoutez des vidéos depuis le menu « ⋮ » d’une miniature."
              action={
                <Link href={PATHS.home} className="kt-btn-primary h-9 px-4">
                  Découvrir des vidéos
                </Link>
              }
            />
          }
          footer={
            detailQuery.isFetching && detail.items.length === 0 ? (
              <div className="flex flex-col gap-3" aria-hidden="true">
                {Array.from({ length: 3 }, (_, index) => (
                  <VideoCardSkeleton key={index} layout="compact" />
                ))}
              </div>
            ) : null
          }
        />
      </PlaylistLayout>

      <Modal
        open={confirmDelete}
        onClose={() => setConfirmDelete(false)}
        title={`Supprimer « ${detail.title} » ?`}
        size="sm"
        footer={
          <>
            <Button variant="ghost" onClick={() => setConfirmDelete(false)}>
              Annuler
            </Button>
            <Button
              variant="brand"
              loading={deletePlaylist.isPending}
              onClick={() => deletePlaylist.mutate()}
            >
              Supprimer
            </Button>
          </>
        }
      >
        <p className="text-kt-base text-fg-muted">
          La playlist et son ordre de lecture seront définitivement supprimés.
          Les vidéos qu'elle contient restent disponibles.
        </p>
      </Modal>
    </LibraryPage>
  );
}

/** Édition en ligne du titre, de la description et de la visibilité. */
function PlaylistEditForm({
  detail,
  onDone,
  queryKey,
}: {
  detail: PlaylistDetailDTO;
  onDone: () => void;
  queryKey: readonly unknown[];
}) {
  const queryClient = useQueryClient();
  const toast = useLibraryToast();

  const [title, setTitle] = useState(detail.title);
  const [description, setDescription] = useState(detail.description ?? '');
  const [visibility, setVisibility] = useState<VideoVisibility>(detail.visibility);
  const [error, setError] = useState<string | undefined>();

  const update = useMutation({
    mutationFn: (input: {
      title?: string;
      description?: string | null;
      visibility?: VideoVisibility;
    }) => api.patch<PlaylistSummaryDTO>(ROUTES.playlists.update(detail.id), input),
    onSuccess: (summary) => {
      // Fusion dans le détail en cache : les items ne sont pas rechargés.
      queryClient.setQueryData<PlaylistDetailDTO>(queryKey, (old) =>
        old ? { ...old, ...summary } : old,
      );
      void queryClient.invalidateQueries({ queryKey: libraryKeys.playlists });
      toast({ message: 'Playlist mise à jour', variant: 'success' });
      onDone();
    },
    onError: (mutationError: unknown) => {
      setError(
        mutationError instanceof ApiClientError
          ? mutationError.message
          : 'Mise à jour impossible',
      );
    },
  });

  const onSubmit = (event: FormEvent<HTMLFormElement>) => {
    event.preventDefault();

    const parsed = updatePlaylistSchema.safeParse({
      title: title.trim(),
      description: description.trim() || null,
      visibility,
    });

    if (!parsed.success) {
      setError(parsed.error.flatten().fieldErrors.title?.[0] ?? 'Formulaire invalide');
      return;
    }

    setError(undefined);
    update.mutate(parsed.data);
  };

  return (
    <form onSubmit={onSubmit} className="flex flex-col gap-3" noValidate>
      <Input
        label="Titre"
        required
        maxLength={100}
        value={title}
        error={error}
        onChange={(event) => setTitle(event.target.value)}
      />
      <Textarea
        label="Description"
        maxLength={2000}
        value={description}
        onChange={(event) => setDescription(event.target.value)}
      />
      <Select
        label="Visibilité"
        options={VISIBILITY_OPTIONS}
        value={visibility}
        onChange={(event) => setVisibility(event.target.value as VideoVisibility)}
      />
      <div className="flex items-center gap-2">
        <Button type="submit" variant="primary" loading={update.isPending}>
          Enregistrer
        </Button>
        <Button variant="ghost" onClick={onDone}>
          Annuler
        </Button>
      </div>
    </form>
  );
}
