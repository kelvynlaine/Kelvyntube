'use client';

import { useEffect, useRef, useState } from 'react';
import { Avatar, Button, Textarea } from '@kelvyntube/ui';

export interface CommentComposerProps {
  /** Nom affiché de l'auteur (avatar de repli). */
  authorName: string;
  authorAvatarUrl?: string | null;
  placeholder?: string;
  submitLabel?: string;
  /** Valeur initiale (édition). */
  initialValue?: string;
  autoFocus?: boolean;
  /** Masque l'avatar (composer imbriqué dans une modale). */
  hideAvatar?: boolean;
  /** Renvoie une promesse : le bouton reste en chargement jusqu'à sa résolution. */
  onSubmit: (text: string) => Promise<void> | void;
  onCancel?: () => void;
  className?: string;
}

const MAX_LENGTH = 10000;

/**
 * Zone de saisie d'un commentaire : le champ s'étend au focus et révèle
 * les boutons « Annuler » / « Commenter ».
 */
export function CommentComposer({
  authorName,
  authorAvatarUrl,
  placeholder = 'Ajouter un commentaire…',
  submitLabel = 'Commenter',
  initialValue = '',
  autoFocus = false,
  hideAvatar = false,
  onSubmit,
  onCancel,
  className,
}: CommentComposerProps) {
  const [value, setValue] = useState(initialValue);
  const [expanded, setExpanded] = useState(autoFocus || Boolean(initialValue));
  const [submitting, setSubmitting] = useState(false);
  const textareaRef = useRef<HTMLTextAreaElement | null>(null);

  useEffect(() => {
    if (autoFocus) textareaRef.current?.focus();
  }, [autoFocus]);

  const trimmed = value.trim();

  const reset = () => {
    setValue('');
    setExpanded(false);
  };

  const handleSubmit = async () => {
    if (!trimmed || submitting) return;
    setSubmitting(true);
    try {
      await onSubmit(trimmed);
      reset();
    } finally {
      setSubmitting(false);
    }
  };

  return (
    <form
      className={className}
      onSubmit={(event) => {
        event.preventDefault();
        void handleSubmit();
      }}
    >
      <div className="flex gap-3">
        {hideAvatar ? null : (
          <Avatar
            name={authorName}
            src={authorAvatarUrl}
            size="md"
            className="mt-1"
          />
        )}

        <div className="flex min-w-0 flex-1 flex-col gap-2">
          <Textarea
            ref={textareaRef}
            aria-label={placeholder}
            placeholder={placeholder}
            value={value}
            rows={1}
            maxRows={10}
            maxLength={MAX_LENGTH}
            onFocus={() => setExpanded(true)}
            onChange={(event) => setValue(event.target.value)}
            onKeyDown={(event) => {
              // Ctrl/⌘ + Entrée envoie, Échap referme.
              if (event.key === 'Enter' && (event.metaKey || event.ctrlKey)) {
                event.preventDefault();
                void handleSubmit();
              }
              if (event.key === 'Escape' && onCancel) {
                event.preventDefault();
                onCancel();
              }
            }}
          />

          {expanded || trimmed ? (
            <div className="flex items-center justify-end gap-2">
              <Button
                variant="ghost"
                onClick={() => {
                  reset();
                  onCancel?.();
                }}
              >
                Annuler
              </Button>
              <Button
                type="submit"
                variant="primary"
                loading={submitting}
                disabled={!trimmed}
              >
                {submitLabel}
              </Button>
            </div>
          ) : null}
        </div>
      </div>
    </form>
  );
}
