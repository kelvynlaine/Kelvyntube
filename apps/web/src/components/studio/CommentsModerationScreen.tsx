'use client';

import Link from 'next/link';
import { useState } from 'react';
import { useMutation, useQuery, useQueryClient } from '@tanstack/react-query';
import { Heart, MessageSquare, Pin, Search, Send, Trash2 } from 'lucide-react';
import {
  ROUTES,
  formatRelativeTime,
  type OffsetPage,
} from '@kelvyntube/shared';
import {
  Avatar,
  Badge,
  Button,
  EmptyState,
  IconButton,
  Input,
  Modal,
  Skeleton,
  Tabs,
  Textarea,
  useToast,
} from '@kelvyntube/ui';
import { api } from '@/lib/api';
import { PATHS } from '@/lib/nav';
import { Panel } from './Panel';
import { StudioThumbnail } from './bits';
import { studioKeys, type StudioCommentDTO, type StudioCommentFilter } from './studio-api';
import { useChannelId, useStudioUrlState } from './useStudioUrlState';

const FILTERS: { id: StudioCommentFilter; label: string }[] = [
  { id: 'all', label: 'Tous' },
  { id: 'unanswered', label: 'Sans réponse' },
  { id: 'held', label: 'En attente' },
];

const PAGE_SIZE = 20;

/**
 * `/studio/[channelId]/commentaires`
 * Modération centralisée de tous les commentaires de la chaîne.
 */
export function CommentsModerationScreen() {
  const channelId = useChannelId();
  const { get, setQuery } = useStudioUrlState();
  const queryClient = useQueryClient();
  const { toast } = useToast();

  const filter = (get('filter') ?? 'all') as StudioCommentFilter;
  const search = get('q') ?? '';
  const page = Number(get('page') ?? 1);

  const [searchDraft, setSearchDraft] = useState(search);
  const [replyTo, setReplyTo] = useState<StudioCommentDTO | null>(null);
  const [replyText, setReplyText] = useState('');
  const [toDelete, setToDelete] = useState<StudioCommentDTO | null>(null);

  const filters = { filter, q: search || undefined, page, pageSize: PAGE_SIZE };

  const query = useQuery({
    queryKey: studioKeys.comments(channelId, filters),
    queryFn: () =>
      api.get<OffsetPage<StudioCommentDTO>>(ROUTES.comments.moderation(channelId), {
        query: filters,
      }),
    enabled: Boolean(channelId),
  });

  const invalidate = () =>
    queryClient.invalidateQueries({ queryKey: ['studio', 'comments', channelId] });

  const remove = useMutation({
    mutationFn: (id: string) => api.delete(ROUTES.comments.delete(id)),
    onSuccess: () => {
      toast({ message: 'Commentaire supprimé', variant: 'success' });
      setToDelete(null);
      void invalidate();
    },
    onError: () => toast({ message: 'Suppression impossible', variant: 'error' }),
  });

  const pin = useMutation({
    mutationFn: (id: string) => api.post(ROUTES.comments.pin(id)),
    onSuccess: () => {
      toast({ message: 'Épinglage mis à jour', variant: 'success' });
      void invalidate();
    },
  });

  const heart = useMutation({
    mutationFn: (id: string) => api.post(ROUTES.comments.heart(id)),
    onSuccess: () => void invalidate(),
  });

  const reply = useMutation({
    mutationFn: ({ videoId, parentId, text }: { videoId: string; parentId: string; text: string }) =>
      api.post(ROUTES.comments.create(videoId), { text, parentId }),
    onSuccess: () => {
      toast({ message: 'Réponse publiée', variant: 'success' });
      setReplyTo(null);
      setReplyText('');
      void invalidate();
    },
    onError: () => toast({ message: 'Publication impossible', variant: 'error' }),
  });

  const items = query.data?.items ?? [];
  const totalPages = query.data?.totalPages ?? 1;

  return (
    <div className="flex flex-col gap-4">
      <header>
        <h1 className="text-kt-xl font-semibold">Commentaires</h1>
        <p className="text-kt-sm text-fg-muted">
          Modérez les commentaires de toutes vos vidéos depuis un seul endroit.
        </p>
      </header>

      <Tabs
        value={filter}
        onChange={(id) => setQuery({ filter: id === 'all' ? null : id }, { resetPage: true })}
        panelIdPrefix="studio-comments"
        items={FILTERS.map((f) => ({ id: f.id, label: f.label }))}
      />

      <form
        role="search"
        onSubmit={(e) => {
          e.preventDefault();
          setQuery({ q: searchDraft || null }, { resetPage: true });
        }}
        className="flex gap-2"
      >
        <Input
          value={searchDraft}
          onChange={(e) => setSearchDraft(e.target.value)}
          placeholder="Rechercher dans les commentaires"
          iconLeft={<Search size={18} />}
          aria-label="Rechercher dans les commentaires"
          containerClassName="max-w-md flex-1"
        />
        <Button type="submit" variant="secondary">
          Rechercher
        </Button>
      </form>

      <section
        id={`studio-comments-${filter}`}
        role="tabpanel"
        aria-labelledby={`studio-comments-tab-${filter}`}
      >
        <Panel bodyClassName="p-0">
          {query.isLoading && (
            <div className="space-y-4 p-4">
              {Array.from({ length: 5 }).map((_, i) => (
                <div key={i} className="flex gap-3">
                  <Skeleton variant="circle" className="h-10 w-10 shrink-0" />
                  <div className="flex-1 space-y-2">
                    <Skeleton variant="text" className="h-3 w-1/3" />
                    <Skeleton variant="text" className="h-3 w-full" />
                  </div>
                </div>
              ))}
            </div>
          )}

          {!query.isLoading && items.length === 0 && (
            <EmptyState
              icon={<MessageSquare size={40} />}
              title="Aucun commentaire"
              description={
                filter === 'held'
                  ? 'Aucun commentaire n’a été signalé par le filtre anti-spam.'
                  : 'Les commentaires laissés sur vos vidéos apparaîtront ici.'
              }
              size="sm"
            />
          )}

          <ul>
            {items.map((comment) => (
              <li key={comment.id} className="border-b border-border p-4 last:border-0">
                <div className="flex gap-3">
                  <Avatar
                    name={comment.author.displayName}
                    src={comment.author.avatarUrl ?? undefined}
                    size="md"
                    className="shrink-0"
                  />
                  <div className="min-w-0 flex-1">
                    <div className="flex flex-wrap items-center gap-2">
                      <span className="text-kt-sm font-medium">{comment.author.displayName}</span>
                      <span className="text-kt-sm text-fg-subtle">
                        {formatRelativeTime(comment.createdAt)}
                      </span>
                      {comment.pinned && <Badge variant="brand">Épinglé</Badge>}
                      {comment.heartedByCreator && <Badge variant="default">❤️ Aimé</Badge>}
                    </div>

                    <p className="mt-1 whitespace-pre-wrap break-words text-kt-base">
                      {comment.text}
                    </p>

                    <div className="mt-2 flex flex-wrap items-center gap-1">
                      <Button
                        variant="ghost"
                        size="sm"
                        iconLeft={<Send size={15} />}
                        onClick={() => {
                          setReplyTo(comment);
                          setReplyText('');
                        }}
                      >
                        Répondre
                      </Button>
                      <IconButton
                        aria-label={comment.pinned ? 'Désépingler' : 'Épingler'}
                        size="sm"
                        active={comment.pinned}
                        onClick={() => pin.mutate(comment.id)}
                      >
                        <Pin size={16} />
                      </IconButton>
                      <IconButton
                        aria-label={comment.heartedByCreator ? 'Retirer le cœur' : 'Aimer'}
                        size="sm"
                        active={comment.heartedByCreator}
                        onClick={() => heart.mutate(comment.id)}
                      >
                        <Heart size={16} />
                      </IconButton>
                      <IconButton
                        aria-label="Supprimer le commentaire"
                        size="sm"
                        onClick={() => setToDelete(comment)}
                      >
                        <Trash2 size={16} />
                      </IconButton>
                    </div>
                  </div>

                  {/* Vidéo concernée */}
                  <Link
                    href={PATHS.studioVideo(channelId, comment.video.id)}
                    className="hidden w-40 shrink-0 feed-2:block"
                    title={comment.video.title}
                  >
                    <StudioThumbnail url={comment.video.thumbnailUrl} className="h-[90px] w-40" />
                    <span className="kt-clamp-2 mt-1 block text-kt-sm text-fg-muted">
                      {comment.video.title}
                    </span>
                  </Link>
                </div>
              </li>
            ))}
          </ul>
        </Panel>
      </section>

      {/* ── Pagination ────────────────────────────────────────────────── */}
      {totalPages > 1 && (
        <nav className="flex items-center justify-center gap-3" aria-label="Pagination">
          <Button
            variant="secondary"
            size="sm"
            disabled={page <= 1}
            onClick={() => setQuery({ page: page - 1 })}
          >
            Précédent
          </Button>
          <span className="text-kt-sm text-fg-muted">
            Page {page} sur {totalPages}
          </span>
          <Button
            variant="secondary"
            size="sm"
            disabled={page >= totalPages}
            onClick={() => setQuery({ page: page + 1 })}
          >
            Suivant
          </Button>
        </nav>
      )}

      {/* ── Modale de réponse ─────────────────────────────────────────── */}
      <Modal
        open={Boolean(replyTo)}
        onClose={() => setReplyTo(null)}
        title="Répondre au commentaire"
        description={replyTo ? `À ${replyTo.author.displayName}` : undefined}
        footer={
          <div className="flex justify-end gap-2">
            <Button variant="ghost" onClick={() => setReplyTo(null)}>
              Annuler
            </Button>
            <Button
              disabled={!replyText.trim()}
              loading={reply.isPending}
              onClick={() =>
                replyTo &&
                reply.mutate({
                  videoId: replyTo.video.id,
                  parentId: replyTo.id,
                  text: replyText.trim(),
                })
              }
            >
              Répondre
            </Button>
          </div>
        }
      >
        {replyTo && (
          <blockquote className="mb-3 border-l-2 border-border pl-3 text-kt-sm text-fg-muted">
            {replyTo.text}
          </blockquote>
        )}
        <Textarea
          label="Votre réponse"
          value={replyText}
          onChange={(e) => setReplyText(e.target.value)}
          rows={3}
          autoResize
          maxLength={10000}
          showCount
        />
      </Modal>

      {/* ── Confirmation de suppression ───────────────────────────────── */}
      <Modal
        open={Boolean(toDelete)}
        onClose={() => setToDelete(null)}
        size="sm"
        title="Supprimer ce commentaire ?"
        description="Cette action est définitive pour son auteur comme pour les autres spectateurs."
        footer={
          <div className="flex justify-end gap-2">
            <Button variant="ghost" onClick={() => setToDelete(null)}>
              Annuler
            </Button>
            <Button
              variant="brand"
              loading={remove.isPending}
              onClick={() => toDelete && remove.mutate(toDelete.id)}
            >
              Supprimer
            </Button>
          </div>
        }
      >
        {toDelete && (
          <p className="whitespace-pre-wrap text-kt-base text-fg-muted">{toDelete.text}</p>
        )}
      </Modal>
    </div>
  );
}
