'use client';

import type { CommentDTO } from '@kelvyntube/shared';
import { formatCompactNumber, formatRelativeTime } from '@kelvyntube/shared';
import {
  ChevronDown,
  Flag,
  Heart,
  MoreVertical,
  Pen,
  Pin,
  SmilePlus,
  ThumbsDown,
  ThumbsUp,
  Trash2,
} from 'lucide-react';
import { useMemo, type ReactNode } from 'react';
import { cn } from '../cn';
import { resolveLinkComponent, type LinkComponent } from '../types';
import { Avatar } from './Avatar';
import { Badge } from './Badge';
import { DropdownMenu, type DropdownMenuItem } from './DropdownMenu';
import { IconButton } from './IconButton';
import { RichText } from './RichText';

/** Callbacks partagés par `CommentItem` et `CommentThread`. */
export interface CommentCallbacks {
  onLike?: (comment: CommentDTO) => void;
  onDislike?: (comment: CommentDTO) => void;
  onReply?: (comment: CommentDTO) => void;
  onDelete?: (comment: CommentDTO) => void;
  onEdit?: (comment: CommentDTO) => void;
  onReport?: (comment: CommentDTO) => void;
  /** Épingler / désépingler (propriétaire de la chaîne). */
  onPin?: (comment: CommentDTO) => void;
  /** Cœur du créateur. */
  onHeart?: (comment: CommentDTO) => void;
  /** Réaction emoji (bascule). */
  onReact?: (comment: CommentDTO, emoji: string) => void;
  /** Clic sur un horodatage du texte (secondes). */
  onTimestampClick?: (seconds: number) => void;
  /** Clic sur une mention @handle. */
  onMentionClick?: (handle: string) => void;
  /** Clic sur un hashtag #tag. */
  onHashtagClick?: (tag: string) => void;
}

export interface CommentItemProps extends CommentCallbacks {
  comment: CommentDTO;
  /** Réponses déjà rendues par le parent. */
  children?: ReactNode;
  /** Les réponses sont-elles dépliées ? */
  repliesOpen?: boolean;
  onToggleReplies?: (comment: CommentDTO) => void;
  loadingReplies?: boolean;
  /** Emojis proposés dans le sélecteur de réaction. */
  reactionChoices?: string[];
  /** Nom du créateur (infobulle du cœur). */
  creatorName?: string;
  /** Rendu compact utilisé pour les réponses. */
  isReply?: boolean;
  linkComponent?: LinkComponent;
  className?: string;
}

const DEFAULT_REACTIONS = ['👍', '😂', '❤️', '🔥', '😮', '😢'];

/** Un commentaire : en-tête, texte enrichi, actions et réactions. */
export function CommentItem({
  comment,
  children,
  repliesOpen = false,
  onToggleReplies,
  loadingReplies = false,
  reactionChoices = DEFAULT_REACTIONS,
  creatorName,
  isReply = false,
  linkComponent,
  className,
  onLike,
  onDislike,
  onReply,
  onDelete,
  onEdit,
  onReport,
  onPin,
  onHeart,
  onReact,
  onTimestampClick,
  onMentionClick,
  onHashtagClick,
}: CommentItemProps) {
  const Link = resolveLinkComponent(linkComponent);
  const liked = comment.viewer.like === 'LIKE';
  const disliked = comment.viewer.like === 'DISLIKE';
  const authorHref = comment.author.handle
    ? comment.author.handle.startsWith('@')
      ? `/${comment.author.handle}`
      : `/@${comment.author.handle}`
    : null;

  const menuItems = useMemo<DropdownMenuItem[]>(() => {
    const items: DropdownMenuItem[] = [];
    if (onEdit && comment.viewer.canDelete) {
      items.push({
        id: 'edit',
        label: 'Modifier',
        icon: <Pen size={18} />,
        onSelect: () => onEdit(comment),
      });
    }
    if (onPin && comment.viewer.canModerate) {
      items.push({
        id: 'pin',
        label: comment.pinned ? 'Ne plus épingler' : 'Épingler',
        icon: <Pin size={18} />,
        onSelect: () => onPin(comment),
      });
    }
    if (onHeart && comment.viewer.canModerate) {
      items.push({
        id: 'heart',
        label: comment.heartedByCreator ? 'Retirer le cœur' : 'Ajouter un cœur',
        icon: <Heart size={18} />,
        onSelect: () => onHeart(comment),
      });
    }
    if (onReport) {
      items.push({
        id: 'report',
        label: 'Signaler',
        icon: <Flag size={18} />,
        onSelect: () => onReport(comment),
      });
    }
    if (onDelete && comment.viewer.canDelete) {
      items.push({
        id: 'delete',
        label: 'Supprimer',
        icon: <Trash2 size={18} />,
        danger: true,
        onSelect: () => onDelete(comment),
      });
    }
    return items;
  }, [comment, onDelete, onEdit, onHeart, onPin, onReport]);

  const avatar = (
    <Avatar
      name={comment.author.displayName}
      src={comment.author.avatarUrl}
      size={isReply ? 'sm' : 'md'}
    />
  );

  return (
    <article className={cn('flex flex-col gap-2', className)}>
      {comment.pinned ? (
        <p className="flex items-center gap-1.5 text-kt-sm text-fg-muted">
          <Pin size={14} aria-hidden="true" />
          Épinglé par le créateur
        </p>
      ) : null}

      {/*
        Indentation : chaque niveau coûte « largeur d'avatar + gouttière ».
        Sous 480 px on descend la gouttière à 8 px, ce qui ramène le retrait
        d'une réponse à 40 px au lieu de 52 — sur un écran de 360 px c'est la
        différence entre une colonne de texte confortable et une colonne
        étranglée. Le rendu ≥ 480 px (gap-3) est inchangé.
      */}
      <div className="flex gap-2 xs:gap-3">
        <div className="relative shrink-0">
          {authorHref ? (
            <Link
              href={authorHref}
              aria-label={comment.author.displayName}
              className="block rounded-full kt-focus-ring"
            >
              {avatar}
            </Link>
          ) : (
            avatar
          )}

          {comment.heartedByCreator ? (
            <span
              className="absolute -bottom-1 -right-1 flex size-4 items-center justify-center rounded-full bg-bg"
              title={
                creatorName ? `Aimé par ${creatorName}` : 'Aimé par le créateur'
              }
            >
              <Heart size={12} className="text-brand" fill="currentColor" />
              <span className="sr-only">
                {creatorName ? `Aimé par ${creatorName}` : 'Aimé par le créateur'}
              </span>
            </span>
          ) : null}
        </div>

        <div className="flex min-w-0 flex-1 flex-col gap-1">
          {/* En-tête : auteur, ancienneté, état d'édition */}
          <p className="flex flex-wrap items-center gap-x-2 text-kt-sm">
            {authorHref ? (
              <Link
                href={authorHref}
                className={cn(
                  'rounded font-medium text-fg kt-focus-ring hover:text-fg-muted',
                  comment.author.isCreator &&
                    'rounded-pill bg-bg-active px-2 py-0.5',
                )}
              >
                {comment.author.handle ?? comment.author.displayName}
              </Link>
            ) : (
              <span className="font-medium text-fg">
                {comment.author.displayName}
              </span>
            )}

            <span className="text-fg-muted">
              {formatRelativeTime(comment.createdAt)}
            </span>

            {comment.edited ? (
              <span className="text-fg-subtle">(modifié)</span>
            ) : null}

            {comment.author.isCreator ? (
              <Badge variant="default">Auteur</Badge>
            ) : null}
          </p>

          <RichText
            text={comment.text}
            onTimestampClick={onTimestampClick}
            onMentionClick={onMentionClick}
            onHashtagClick={onHashtagClick}
            // `break-words` : une URL collée dans un commentaire fait sinon
            // déborder toute la colonne sur téléphone.
            className="break-words text-kt-base text-fg"
          />

          {/*
            Actions : `flex-wrap` est essentiel une fois les cibles portées à
            44 px au doigt — like, dislike, « Répondre » et les réactions
            passent alors à la ligne au lieu de déborder de la colonne.
          */}
          <div className="-ml-2 flex flex-wrap items-center gap-1">
            <button
              type="button"
              aria-pressed={liked}
              aria-label={liked ? 'Retirer le like' : "J'aime ce commentaire"}
              onClick={() => onLike?.(comment)}
              className="inline-flex items-center justify-center gap-1.5 rounded-pill px-2 py-1.5 text-kt-sm text-fg-muted transition-colors kt-tap hover:bg-bg-hover hover:text-fg kt-focus-ring"
            >
              <ThumbsUp
                size={16}
                aria-hidden="true"
                fill={liked ? 'currentColor' : 'none'}
              />
              {comment.likeCount > 0 ? (
                <span className="tabular-nums">
                  {formatCompactNumber(comment.likeCount)}
                </span>
              ) : null}
            </button>

            <button
              type="button"
              aria-pressed={disliked}
              aria-label={disliked ? 'Retirer le dislike' : "Je n'aime pas"}
              onClick={() => onDislike?.(comment)}
              className="inline-flex items-center justify-center rounded-pill px-2 py-1.5 text-fg-muted transition-colors kt-tap hover:bg-bg-hover hover:text-fg kt-focus-ring"
            >
              <ThumbsDown
                size={16}
                aria-hidden="true"
                fill={disliked ? 'currentColor' : 'none'}
              />
            </button>

            {onReply ? (
              <button
                type="button"
                onClick={() => onReply(comment)}
                className="inline-flex items-center rounded-pill px-3 py-1.5 text-kt-sm font-medium text-fg transition-colors kt-tap-y hover:bg-bg-hover kt-focus-ring"
              >
                Répondre
              </button>
            ) : null}

            {/* Réactions existantes */}
            {comment.reactions.map((reaction) => (
              <button
                key={reaction.emoji}
                type="button"
                aria-pressed={reaction.reacted}
                aria-label={`${reaction.emoji} ${reaction.count}`}
                onClick={() => onReact?.(comment, reaction.emoji)}
                className={cn(
                  'inline-flex items-center gap-1 rounded-pill border px-2 py-0.5 text-kt-sm transition-colors kt-tap-y kt-focus-ring',
                  reaction.reacted
                    ? 'border-accent-fg bg-accent/40 text-fg'
                    : 'border-border text-fg-muted hover:bg-bg-hover',
                )}
              >
                <span aria-hidden="true">{reaction.emoji}</span>
                <span className="tabular-nums">{reaction.count}</span>
              </button>
            ))}

            {onReact ? (
              <DropdownMenu
                align="start"
                label="Ajouter une réaction"
                items={reactionChoices.map((emoji) => ({
                  id: emoji,
                  label: `${emoji}`,
                  onSelect: () => onReact(comment, emoji),
                }))}
                menuClassName="min-w-0"
                trigger={(triggerProps) => (
                  <IconButton
                    {...triggerProps}
                    aria-label="Ajouter une réaction"
                    size="sm"
                    className="text-fg-muted"
                  >
                    <SmilePlus size={16} />
                  </IconButton>
                )}
              />
            ) : null}
          </div>

          {/* Réponses */}
          {comment.replyCount > 0 && onToggleReplies ? (
            <button
              type="button"
              aria-expanded={repliesOpen}
              onClick={() => onToggleReplies(comment)}
              className="mt-1 inline-flex w-fit items-center gap-2 rounded-pill px-3 py-1.5 text-left text-kt-base font-medium text-accent-fg transition-colors kt-tap-y hover:bg-accent/30 kt-focus-ring"
            >
              <ChevronDown
                size={18}
                aria-hidden="true"
                className={cn('transition-transform', repliesOpen && 'rotate-180')}
              />
              {loadingReplies
                ? 'Chargement…'
                : repliesOpen
                  ? 'Masquer les réponses'
                  : `Afficher les ${comment.replyCount} réponse${
                      comment.replyCount > 1 ? 's' : ''
                    }`}
            </button>
          ) : null}

          {repliesOpen && children ? (
            <div className="mt-2 flex flex-col gap-4">{children}</div>
          ) : null}
        </div>

        {menuItems.length > 0 ? (
          <DropdownMenu
            items={menuItems}
            align="end"
            label="Actions sur le commentaire"
            className="shrink-0"
            trigger={(triggerProps) => (
              <IconButton
                {...triggerProps}
                aria-label="Actions sur le commentaire"
                size="sm"
                // Colonne de droite d'une ligne déjà indentée : on étend la
                // zone tactile sans élargir la boîte (cf. `IconButton`).
                touchTarget="halo"
                className="text-fg-muted"
              >
                <MoreVertical size={16} />
              </IconButton>
            )}
          />
        ) : null}
      </div>
    </article>
  );
}
