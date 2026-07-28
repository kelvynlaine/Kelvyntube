'use client';

import { useCallback, useMemo, useState } from 'react';
import { useQuery, useQueryClient } from '@tanstack/react-query';
import { Plus } from 'lucide-react';
import {
  Button,
  Checkbox,
  Input,
  Modal,
  Skeleton,
  useToast,
} from '@kelvyntube/ui';
import {
  ROUTES,
  type PlaylistDetailDTO,
  type PlaylistSummaryDTO,
} from '@kelvyntube/shared';
import { api } from '@/lib/api';

export interface SaveToPlaylistModalProps {
  open: boolean;
  onClose: () => void;
  videoId: string;
}

const PLAYLISTS_KEY = ['playlists', 'mine'] as const;

/**
 * Modale « Enregistrer » : cases à cocher sur les playlists de l'utilisateur
 * et création rapide d'une nouvelle playlist contenant la vidéo.
 */
export function SaveToPlaylistModal({
  open,
  onClose,
  videoId,
}: SaveToPlaylistModalProps) {
  const queryClient = useQueryClient();
  const { toast } = useToast();

  const [creating, setCreating] = useState(false);
  const [title, setTitle] = useState('');
  const [isPrivate, setIsPrivate] = useState(true);
  const [saving, setSaving] = useState(false);
  /** Surcharges locales (mise à jour optimiste des cases). */
  const [overrides, setOverrides] = useState<Record<string, boolean>>({});

  const playlistsQuery = useQuery<PlaylistSummaryDTO[]>({
    queryKey: PLAYLISTS_KEY,
    queryFn: () => api.get<PlaylistSummaryDTO[]>(ROUTES.playlists.list),
    enabled: open,
  });

  const playlists = useMemo(
    () => playlistsQuery.data ?? [],
    [playlistsQuery.data],
  );

  /** Playlists contenant déjà la vidéo (une requête par playlist, en cache). */
  const membershipQuery = useQuery<string[]>({
    queryKey: ['playlists', 'membership', videoId, playlists.map((p) => p.id)],
    enabled: open && playlists.length > 0,
    queryFn: async () => {
      const details = await Promise.all(
        playlists.map((playlist) =>
          api
            .get<PlaylistDetailDTO>(ROUTES.playlists.byId(playlist.id))
            .catch(() => null),
        ),
      );
      return details
        .filter((detail): detail is PlaylistDetailDTO => detail !== null)
        .filter((detail) => detail.items.some((item) => item.id === videoId))
        .map((detail) => detail.id);
    },
  });

  const isChecked = useCallback(
    (playlistId: string) =>
      overrides[playlistId] ?? (membershipQuery.data?.includes(playlistId) ?? false),
    [membershipQuery.data, overrides],
  );

  const toggle = useCallback(
    async (playlist: PlaylistSummaryDTO, next: boolean) => {
      setOverrides((current) => ({ ...current, [playlist.id]: next }));
      try {
        if (next) {
          await api.post(ROUTES.playlists.addItem(playlist.id), { videoId });
          toast({ message: `Ajoutée à « ${playlist.title} »`, variant: 'success' });
        } else {
          await api.delete(ROUTES.playlists.removeItem(playlist.id, videoId));
          toast({ message: `Retirée de « ${playlist.title} »` });
        }
        void queryClient.invalidateQueries({ queryKey: PLAYLISTS_KEY });
      } catch {
        setOverrides((current) => ({ ...current, [playlist.id]: !next }));
        toast({ message: 'Enregistrement impossible.', variant: 'error' });
      }
    },
    [queryClient, toast, videoId],
  );

  const createPlaylist = useCallback(async () => {
    const trimmed = title.trim();
    if (!trimmed) return;
    setSaving(true);
    try {
      const created = await api.post<PlaylistSummaryDTO>(ROUTES.playlists.create, {
        title: trimmed,
        visibility: isPrivate ? 'PRIVATE' : 'PUBLIC',
        videoId,
      });
      setOverrides((current) => ({ ...current, [created.id]: true }));
      setTitle('');
      setCreating(false);
      await queryClient.invalidateQueries({ queryKey: PLAYLISTS_KEY });
      toast({ message: `Playlist « ${created.title} » créée.`, variant: 'success' });
    } catch {
      toast({ message: 'Création impossible.', variant: 'error' });
    } finally {
      setSaving(false);
    }
  }, [isPrivate, queryClient, title, toast, videoId]);

  const loading = playlistsQuery.isPending || membershipQuery.isPending;

  return (
    <Modal
      open={open}
      onClose={onClose}
      title="Enregistrer dans…"
      size="sm"
      footer={
        creating ? null : (
          <Button
            variant="ghost"
            iconLeft={<Plus size={18} />}
            onClick={() => setCreating(true)}
          >
            Créer une playlist
          </Button>
        )
      }
    >
      <div className="flex flex-col gap-4">
        {loading ? (
          <div className="flex flex-col gap-3" aria-hidden="true">
            {Array.from({ length: 3 }).map((_, index) => (
              <Skeleton key={index} variant="text" className="h-5 w-2/3" />
            ))}
          </div>
        ) : playlists.length === 0 && !creating ? (
          <p className="text-kt-base text-fg-muted">
            Vous n'avez pas encore de playlist.
          </p>
        ) : (
          <ul className="flex flex-col gap-3">
            {playlists.map((playlist) => (
              <li key={playlist.id}>
                <Checkbox
                  checked={isChecked(playlist.id)}
                  onChange={(event) => void toggle(playlist, event.target.checked)}
                  label={playlist.title}
                  description={
                    playlist.visibility === 'PRIVATE' ? 'Privée' : 'Publique'
                  }
                />
              </li>
            ))}
          </ul>
        )}

        {creating ? (
          <form
            className="flex flex-col gap-3 border-t border-border pt-4"
            onSubmit={(event) => {
              event.preventDefault();
              void createPlaylist();
            }}
          >
            <Input
              label="Nom de la playlist"
              value={title}
              maxLength={100}
              autoFocus
              onChange={(event) => setTitle(event.target.value)}
            />
            <Checkbox
              checked={isPrivate}
              onChange={(event) => setIsPrivate(event.target.checked)}
              label="Playlist privée"
            />
            <div className="flex justify-end gap-2">
              <Button variant="ghost" onClick={() => setCreating(false)}>
                Annuler
              </Button>
              <Button
                type="submit"
                variant="primary"
                loading={saving}
                disabled={!title.trim()}
              >
                Créer
              </Button>
            </div>
          </form>
        ) : null}
      </div>
    </Modal>
  );
}
