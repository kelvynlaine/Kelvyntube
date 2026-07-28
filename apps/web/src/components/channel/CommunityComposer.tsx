'use client';

import { useMutation, useQueryClient } from '@tanstack/react-query';
import { useState } from 'react';
import { z } from 'zod';
import { ROUTES, type ChannelDTO } from '@kelvyntube/shared';
import { Button, Input, Textarea } from '@kelvyntube/ui';
import { api, ApiClientError } from '@/lib/api';
import { channelKeys, errorMessage, type ChannelPostDTO } from './queries';

/** Même contrat que l'API (`createPostSchema` du module chaînes). */
const composerSchema = z.object({
  text: z.string().min(1, 'Publication vide').max(5000, 'Au plus 5000 caractères'),
  imageUrl: z.string().url('URL d’image invalide').nullable().optional(),
});

export interface CommunityComposerProps {
  channel: ChannelDTO;
}

/** Zone de publication réservée au propriétaire de la chaîne. */
export function CommunityComposer({ channel }: CommunityComposerProps) {
  const queryClient = useQueryClient();
  const [text, setText] = useState('');
  const [imageUrl, setImageUrl] = useState('');
  const [errors, setErrors] = useState<{ text?: string; imageUrl?: string; global?: string }>({});

  const mutation = useMutation({
    mutationFn: (body: { text: string; imageUrl: string | null }) =>
      api.post<ChannelPostDTO>(ROUTES.channels.posts(channel.id), body),
    onSuccess: () => {
      setText('');
      setImageUrl('');
      setErrors({});
      void queryClient.invalidateQueries({ queryKey: channelKeys.posts(channel.id) });
    },
    onError: (err) => {
      if (err instanceof ApiClientError) {
        setErrors({
          text: err.fieldError('text'),
          imageUrl: err.fieldError('imageUrl'),
          global: err.details ? undefined : err.message,
        });
        return;
      }
      setErrors({ global: errorMessage(err) });
    },
  });

  const submit = (event: React.FormEvent) => {
    event.preventDefault();
    const parsed = composerSchema.safeParse({
      text,
      imageUrl: imageUrl.trim() === '' ? null : imageUrl.trim(),
    });
    if (!parsed.success) {
      const fields = parsed.error.flatten().fieldErrors;
      setErrors({ text: fields.text?.[0], imageUrl: fields.imageUrl?.[0] });
      return;
    }
    setErrors({});
    mutation.mutate({ text: parsed.data.text, imageUrl: parsed.data.imageUrl ?? null });
  };

  return (
    <form
      onSubmit={submit}
      noValidate
      className="flex flex-col gap-3 rounded-kt border border-border bg-bg-elevated p-4"
    >
      <h2 className="text-kt-md font-medium text-fg">Publier sur la communauté</h2>

      <Textarea
        label="Message"
        placeholder="Partage une actualité avec tes abonnés…"
        value={text}
        maxLength={5000}
        showCount
        rows={3}
        error={errors.text}
        onChange={(event) => setText(event.target.value)}
      />

      <Input
        label="Image (URL, facultatif)"
        type="url"
        inputMode="url"
        autoComplete="off"
        placeholder="https://…"
        value={imageUrl}
        error={errors.imageUrl}
        onChange={(event) => setImageUrl(event.target.value)}
      />

      {errors.global ? (
        <p role="alert" className="text-kt-sm text-danger">
          {errors.global}
        </p>
      ) : null}

      <div className="flex justify-end">
        <Button
          type="submit"
          variant="primary"
          loading={mutation.isPending}
          disabled={text.trim().length === 0}
        >
          Publier
        </Button>
      </div>
    </form>
  );
}
