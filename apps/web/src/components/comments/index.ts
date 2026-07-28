/**
 * Module commentaires de la page de visionnage.
 * Les pages n'importent QUE depuis ce fichier.
 */

export { CommentsSection } from './CommentsSection';
export type { CommentsSectionProps } from './CommentsSection';

export { CommentComposer } from './CommentComposer';
export type { CommentComposerProps } from './CommentComposer';

export { useComments } from './useComments';
export type {
  PendingComment,
  UseCommentsOptions,
  UseCommentsResult,
} from './useComments';
