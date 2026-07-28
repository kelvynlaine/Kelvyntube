'use client';

import { useCallback, useMemo, useState } from 'react';
import Link from 'next/link';
import { useRouter } from 'next/navigation';
import { MessageSquareOff } from 'lucide-react';
import {
  Button,
  CommentItem,
  CommentThread,
  Modal,
  useToast,
  type CommentCallbacks,
} from '@kelvyntube/ui';
import type { CommentDTO, VideoDetailDTO } from '@kelvyntube/shared';
import { useAuth } from '@/lib/auth-context';
import { PATHS } from '@/lib/nav';
import { CommentComposer } from './CommentComposer';
import { useComments } from './useComments';

export interface CommentsSectionProps {
  video: VideoDetailDTO;
  /** Saut dans le lecteur au clic sur un horodatage. */
  onSeek: (seconds: number) => void;
  className?: string;
}

/**
 * Section commentaires de la page de visionnage : en-tête + tri, zone de
 * saisie, fil paginé, réponses à la demande et actions de modération.
 */
export function CommentsSection({ video, onSeek, className }: CommentsSectionProps) {
  const router = useRouter();
  const { user, requireAuth } = useAuth();
  const { toast } = useToast();

  const thread = useComments({
    videoId: video.id,
    enabled: video.commentsEnabled,
    currentUserId: user?.id ?? null,
  });

  const [replyTo, setReplyTo] = useState<CommentDTO | null>(null);
  const [editing, setEditing] = useState<CommentDTO | null>(null);
  const [confirmDelete, setConfirmDelete] = useState<CommentDTO | null>(null);
  const [deleting, setDeleting] = useState(false);

  /** Auteur utilisé pour l'affichage optimiste (chaîne active si elle existe). */
  const optimisticAuthor = useMemo<CommentDTO['author']>(() => {
    const channel = user?.channels.find((c) => c.id === user.activeChannelId);
    return {
      id: user?.id ?? 'moi',
      displayName: channel?.name ?? user?.displayName ?? 'Moi',
      avatarUrl: channel?.avatarUrl ?? user?.avatarUrl ?? null,
      handle: channel?.handle ?? null,
      isCreator: video.channel.viewer.isOwner,
    };
  }, [user, video.channel.viewer.isOwner]);

  const guard = useCallback(
    (action: string) => {
      if (user) return true;
      requireAuth(action);
      return false;
    },
    [requireAuth, user],
  );

  const notifyError = useCallback(
    (message: string) => toast({ message, variant: 'error' }),
    [toast],
  );

  const submitComment = useCallback(
    async (text: string) => {
      if (!guard('commenter')) return;
      try {
        await thread.create(text, null, optimisticAuthor);
      } catch {
        notifyError("Impossible de publier le commentaire. Réessayez.");
      }
    },
    [guard, notifyError, optimisticAuthor, thread],
  );

  const submitReply = useCallback(
    async (text: string) => {
      if (!replyTo || !guard('répondre')) return;
      const parent = replyTo;
      setReplyTo(null);
      try {
        await thread.create(text, parent.id, optimisticAuthor);
      } catch {
        notifyError("Impossible de publier la réponse. Réessayez.");
      }
    },
    [guard, notifyError, optimisticAuthor, replyTo, thread],
  );

  const callbacks = useMemo<CommentCallbacks>(
    () => ({
      onLike: (comment) => {
        if (!guard('aimer un commentaire')) return;
        void thread.setLike(comment, 'LIKE').catch(() => {
          notifyError('Action impossible pour le moment.');
        });
      },
      onDislike: (comment) => {
        if (!guard('noter un commentaire')) return;
        void thread.setLike(comment, 'DISLIKE').catch(() => {
          notifyError('Action impossible pour le moment.');
        });
      },
      onReply: (comment) => {
        if (!guard('répondre')) return;
        setReplyTo(comment);
      },
      onEdit: (comment) => setEditing(comment),
      onDelete: (comment) => setConfirmDelete(comment),
      onReport: () => {
        if (!guard('signaler')) return;
        toast({
          message: 'Merci, ce commentaire a été signalé à la modération.',
          variant: 'success',
        });
      },
      onPin: (comment) => {
        void thread.pin(comment).catch(() => notifyError('Épinglage impossible.'));
      },
      onHeart: (comment) => {
        void thread.heart(comment).catch(() => notifyError('Action impossible.'));
      },
      onReact: (comment, emoji) => {
        if (!guard('réagir')) return;
        void thread.react(comment, emoji).catch(() => {
          notifyError('Réaction impossible pour le moment.');
        });
      },
      onTimestampClick: onSeek,
      onMentionClick: (handle) => router.push(PATHS.channel(handle)),
      onHashtagClick: (tag) => router.push(PATHS.hashtag(tag)),
    }),
    [guard, notifyError, onSeek, router, thread, toast],
  );

  // ── Commentaires désactivés ─────────────────────────────────────────────
  if (!video.commentsEnabled) {
    return (
      <section aria-label="Commentaires" className={className}>
        <p className="flex items-center gap-2 rounded-kt bg-bg-elevated p-4 text-kt-base text-fg-muted">
          <MessageSquareOff size={18} aria-hidden="true" />
          Les commentaires sont désactivés pour cette vidéo.
        </p>
      </section>
    );
  }

  const composer = (
    <div className="flex flex-col gap-4">
      {user ? (
        <CommentComposer
          authorName={optimisticAuthor.displayName}
          authorAvatarUrl={optimisticAuthor.avatarUrl}
          onSubmit={submitComment}
        />
      ) : (
        <div className="flex flex-wrap items-center justify-between gap-3 rounded-kt bg-bg-elevated p-4">
          <p className="text-kt-base text-fg-muted">
            Connectez-vous pour participer à la discussion.
          </p>
          <Button variant="primary" onClick={() => requireAuth('commenter')}>
            Se connecter
          </Button>
        </div>
      )}

      {/* Commentaires en cours d'envoi (affichés immédiatement) */}
      {thread.pending.map((item) => (
        <div key={item.tempId} className="flex flex-col gap-1">
          <CommentItem
            comment={item.comment}
            linkComponent={Link}
            creatorName={video.channel.name}
            className="opacity-60"
          />
          {item.failed ? (
            <p className="flex items-center gap-2 pl-[52px] text-kt-sm text-danger">
              Échec de l'envoi.
              <button
                type="button"
                onClick={() => thread.discardPending(item.tempId)}
                className="rounded font-medium text-accent-fg hover:underline kt-focus-ring"
              >
                Supprimer
              </button>
            </p>
          ) : (
            <p className="pl-[52px] text-kt-sm text-fg-subtle" aria-live="polite">
              Envoi en cours…
            </p>
          )}
        </div>
      ))}
    </div>
  );

  return (
    <section aria-label="Commentaires" className={className}>
      <CommentThread
        comments={thread.comments}
        totalCount={video.commentCount + thread.localCount}
        sort={thread.sort}
        onSortChange={thread.setSort}
        expandedIds={thread.expandedIds}
        onToggleReplies={(comment) => void thread.toggleReplies(comment)}
        loadingReplyIds={thread.loadingReplyIds}
        loading={thread.loading}
        hasMore={thread.hasMore}
        loadingMore={thread.loadingMore}
        onLoadMore={thread.loadMore}
        composer={composer}
        creatorName={video.channel.name}
        linkComponent={Link}
        {...callbacks}
      />

      {/* Composer de réponse (le fil du design system n'expose pas de slot imbriqué) */}
      <Modal
        open={replyTo !== null}
        onClose={() => setReplyTo(null)}
        title={
          replyTo
            ? `Répondre à ${replyTo.author.handle ?? replyTo.author.displayName}`
            : 'Répondre'
        }
        size="md"
      >
        {replyTo ? (
          <div className="flex flex-col gap-4">
            <blockquote className="kt-clamp-3 rounded-kt bg-bg p-3 text-kt-sm text-fg-muted">
              {replyTo.text}
            </blockquote>
            <CommentComposer
              authorName={optimisticAuthor.displayName}
              authorAvatarUrl={optimisticAuthor.avatarUrl}
              placeholder="Votre réponse…"
              submitLabel="Répondre"
              autoFocus
              onSubmit={submitReply}
              onCancel={() => setReplyTo(null)}
            />
          </div>
        ) : null}
      </Modal>

      {/* Édition */}
      <Modal
        open={editing !== null}
        onClose={() => setEditing(null)}
        title="Modifier le commentaire"
        size="md"
      >
        {editing ? (
          <CommentComposer
            authorName={optimisticAuthor.displayName}
            hideAvatar
            placeholder="Modifier votre commentaire…"
            submitLabel="Enregistrer"
            initialValue={editing.text}
            autoFocus
            onCancel={() => setEditing(null)}
            onSubmit={async (text) => {
              const target = editing;
              setEditing(null);
              try {
                await thread.edit(target, text);
                toast({ message: 'Commentaire modifié.', variant: 'success' });
              } catch {
                notifyError('Modification impossible.');
              }
            }}
          />
        ) : null}
      </Modal>

      {/* Confirmation de suppression */}
      <Modal
        open={confirmDelete !== null}
        onClose={() => setConfirmDelete(null)}
        title="Supprimer le commentaire ?"
        description="Cette action est définitive."
        size="sm"
        footer={
          <>
            <Button variant="ghost" onClick={() => setConfirmDelete(null)}>
              Annuler
            </Button>
            <Button
              variant="brand"
              loading={deleting}
              onClick={async () => {
                if (!confirmDelete) return;
                setDeleting(true);
                try {
                  await thread.remove(confirmDelete);
                  toast({ message: 'Commentaire supprimé.', variant: 'success' });
                  setConfirmDelete(null);
                } catch {
                  notifyError('Suppression impossible.');
                } finally {
                  setDeleting(false);
                }
              }}
            >
              Supprimer
            </Button>
          </>
        }
      >
        <p className="kt-clamp-3 text-kt-base text-fg-muted">
          {confirmDelete?.text}
        </p>
      </Modal>
    </section>
  );
}
