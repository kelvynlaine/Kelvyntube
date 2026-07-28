'use client';

import type { CommentDTO, CommentSort } from '@kelvyntube/shared';
import { formatCompactNumber } from '@kelvyntube/shared';
import { ArrowDownUp, MessageSquare } from 'lucide-react';
import type { ReactNode } from 'react';
import { cn } from '../cn';
import type { LinkComponent } from '../types';
import { Button } from './Button';
import { CommentItem, type CommentCallbacks } from './CommentItem';
import { DropdownMenu } from './DropdownMenu';
import { EmptyState } from './EmptyState';
import { Skeleton } from './Skeleton';

export interface CommentThreadProps extends CommentCallbacks {
  comments: CommentDTO[];
  /** Nombre total de commentaires (en-tête). */
  totalCount?: number;
  sort?: CommentSort;
  onSortChange?: (sort: CommentSort) => void;
  /** Identifiants des commentaires dont les réponses sont dépliées. */
  expandedIds?: string[];
  onToggleReplies?: (comment: CommentDTO) => void;
  /** Identifiants dont les réponses sont en cours de chargement. */
  loadingReplyIds?: string[];
  /** Chargement initial. */
  loading?: boolean;
  hasMore?: boolean;
  loadingMore?: boolean;
  onLoadMore?: () => void;
  /** Formulaire de saisie fourni par la page. */
  composer?: ReactNode;
  /** Contenu affiché quand il n'y a aucun commentaire. */
  emptyState?: ReactNode;
  creatorName?: string;
  reactionChoices?: string[];
  linkComponent?: LinkComponent;
  className?: string;
}

const SORT_LABEL: Record<CommentSort, string> = {
  top: 'Les plus pertinents',
  newest: 'Les plus récents',
};

/** Fil de commentaires : tri, liste, réponses dépliables et pagination. */
export function CommentThread({
  comments,
  totalCount,
  sort = 'top',
  onSortChange,
  expandedIds = [],
  onToggleReplies,
  loadingReplyIds = [],
  loading = false,
  hasMore = false,
  loadingMore = false,
  onLoadMore,
  composer,
  emptyState,
  creatorName,
  reactionChoices,
  linkComponent,
  className,
  ...callbacks
}: CommentThreadProps) {
  const count = totalCount ?? comments.length;

  if (loading) {
    return (
      <div className={cn('flex flex-col gap-6', className)}>
        {Array.from({ length: 3 }).map((_, index) => (
          <div key={index} className="flex gap-3">
            <Skeleton variant="circle" className="size-10 shrink-0" />
            <div className="flex flex-1 flex-col gap-2">
              <Skeleton variant="text" className="h-3 w-32" />
              <Skeleton variant="text" className="h-3 w-full" />
              <Skeleton variant="text" className="h-3 w-2/3" />
            </div>
          </div>
        ))}
      </div>
    );
  }

  return (
    <section className={cn('flex flex-col gap-6', className)}>
      {/* `gap-4` sous 480 px : 24 px entre le titre et le sélecteur de tri
          font passer le tri à la ligne inutilement sur un écran de 320 px. */}
      <header className="flex flex-wrap items-center gap-x-4 gap-y-2 xs:gap-6">
        <h2 className="text-kt-md font-medium text-fg">
          {formatCompactNumber(count)} commentaire{count > 1 ? 's' : ''}
        </h2>

        {onSortChange ? (
          <DropdownMenu
            align="start"
            label="Trier les commentaires"
            triggerLabel={`Trier : ${SORT_LABEL[sort]}`}
            triggerClassName="gap-2 px-2 py-1 text-kt-base font-medium text-fg hover:bg-bg-hover"
            trigger={
              <>
                <ArrowDownUp size={18} aria-hidden="true" />
                Trier par
              </>
            }
            items={(['top', 'newest'] as CommentSort[]).map((option) => ({
              id: option,
              label: SORT_LABEL[option],
              checked: sort === option,
              onSelect: () => onSortChange(option),
            }))}
          />
        ) : null}
      </header>

      {composer}

      {comments.length === 0 ? (
        (emptyState ?? (
          <EmptyState
            icon={<MessageSquare size={24} />}
            size="sm"
            title="Aucun commentaire pour le moment"
            description="Soyez la première personne à donner votre avis."
          />
        ))
      ) : (
        <div className="flex flex-col gap-6">
          {comments.map((comment) => {
            const open = expandedIds.includes(comment.id);
            return (
              <CommentItem
                key={comment.id}
                comment={comment}
                repliesOpen={open}
                onToggleReplies={onToggleReplies}
                loadingReplies={loadingReplyIds.includes(comment.id)}
                creatorName={creatorName}
                reactionChoices={reactionChoices}
                linkComponent={linkComponent}
                {...callbacks}
              >
                {comment.replies?.map((reply) => (
                  <CommentItem
                    key={reply.id}
                    comment={reply}
                    isReply
                    creatorName={creatorName}
                    reactionChoices={reactionChoices}
                    linkComponent={linkComponent}
                    {...callbacks}
                  />
                ))}
              </CommentItem>
            );
          })}
        </div>
      )}

      {hasMore && onLoadMore ? (
        <Button
          variant="ghost"
          loading={loadingMore}
          onClick={onLoadMore}
          className="self-center"
        >
          Afficher plus de commentaires
        </Button>
      ) : null}
    </section>
  );
}
