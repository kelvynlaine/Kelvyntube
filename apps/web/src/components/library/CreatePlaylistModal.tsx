'use client';

import { useMutation, useQueryClient } from '@tanstack/react-query';
import { useState, type FormEvent } from 'react';
import {
  ROUTES,
  createPlaylistSchema,
  type PlaylistSummaryDTO,
  type VideoVisibility,
} from '@kelvyntube/shared';
import { Button, Input, Modal, Select, Textarea } from '@kelvyntube/ui';
import { ApiClientError, api } from '@/lib/api';
import { useLibraryToast } from './hooks';
import { libraryKeys } from './queries';
import { VISIBILITY_OPTIONS } from './playlist-utils';

/** Erreurs de validation champ par champ. */
type FieldErrors = Partial<Record<'title' | 'description' | 'visibility', string>>;

/** Modale de création d'une playlist (validée par `createPlaylistSchema`). */
export function CreatePlaylistModal({
  open,
  onClose,
}: {
  open: boolean;
  onClose: () => void;
}) {
  const queryClient = useQueryClient();
  const toast = useLibraryToast();

  const [title, setTitle] = useState('');
  const [description, setDescription] = useState('');
  const [visibility, setVisibility] = useState<VideoVisibility>('PRIVATE');
  const [errors, setErrors] = useState<FieldErrors>({});

  const reset = () => {
    setTitle('');
    setDescription('');
    setVisibility('PRIVATE');
    setErrors({});
  };

  const close = () => {
    reset();
    onClose();
  };

  const create = useMutation({
    mutationFn: (input: { title: string; description?: string; visibility: VideoVisibility }) =>
      api.post<PlaylistSummaryDTO>(ROUTES.playlists.create, input),
    onSuccess: (playlist) => {
      void queryClient.invalidateQueries({ queryKey: libraryKeys.playlists });
      toast({ message: `Playlist « ${playlist.title} » créée`, variant: 'success' });
      close();
    },
    onError: (error: unknown) => {
      if (error instanceof ApiClientError) {
        setErrors({
          title: error.fieldError('title'),
          description: error.fieldError('description'),
          visibility: error.fieldError('visibility'),
        });
        toast({ message: error.message, variant: 'error' });
        return;
      }
      toast({ message: 'Création impossible pour le moment', variant: 'error' });
    },
  });

  const onSubmit = (event: FormEvent<HTMLFormElement>) => {
    event.preventDefault();

    const parsed = createPlaylistSchema.safeParse({
      title: title.trim(),
      description: description.trim() || undefined,
      visibility,
    });

    if (!parsed.success) {
      const flat = parsed.error.flatten().fieldErrors;
      setErrors({
        title: flat.title?.[0],
        description: flat.description?.[0],
        visibility: flat.visibility?.[0],
      });
      return;
    }

    setErrors({});
    create.mutate(parsed.data);
  };

  return (
    <Modal
      open={open}
      onClose={close}
      title="Nouvelle playlist"
      description="Regroupez vos vidéos et retrouvez-les depuis votre bibliothèque."
      size="md"
      footer={
        <>
          <Button variant="ghost" onClick={close}>
            Annuler
          </Button>
          <Button
            variant="primary"
            type="submit"
            form="kt-create-playlist"
            loading={create.isPending}
          >
            Créer
          </Button>
        </>
      }
    >
      <form
        id="kt-create-playlist"
        onSubmit={onSubmit}
        className="flex flex-col gap-4"
        noValidate
      >
        <Input
          label="Titre"
          required
          autoFocus
          maxLength={100}
          value={title}
          error={errors.title}
          onChange={(event) => setTitle(event.target.value)}
          placeholder="Ex. Mes tutoriels préférés"
        />

        <Textarea
          label="Description"
          maxLength={2000}
          showCount
          value={description}
          error={errors.description}
          onChange={(event) => setDescription(event.target.value)}
          placeholder="À quoi sert cette playlist ?"
        />

        <Select
          label="Visibilité"
          options={VISIBILITY_OPTIONS}
          value={visibility}
          error={errors.visibility}
          onChange={(event) =>
            setVisibility(event.target.value as VideoVisibility)
          }
          hint="Une playlist privée n'est visible que par vous."
        />
      </form>
    </Modal>
  );
}
