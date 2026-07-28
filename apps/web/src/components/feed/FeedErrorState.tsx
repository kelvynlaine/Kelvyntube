'use client';

import { RefreshCw, TriangleAlert } from 'lucide-react';
import { Button, cn } from '@kelvyntube/ui';

export interface FeedErrorStateProps {
  title?: string;
  description?: string;
  onRetry?: () => void;
  retrying?: boolean;
  className?: string;
}

/** Encart d'erreur de chargement avec bouton « Réessayer ». */
export function FeedErrorState({
  title = 'Impossible de charger les vidéos',
  description = 'Vérifiez votre connexion, puis réessayez.',
  onRetry,
  retrying = false,
  className,
}: FeedErrorStateProps) {
  return (
    <div
      role="alert"
      className={cn(
        'flex flex-col items-center justify-center gap-3 rounded-kt border border-border bg-bg-elevated px-6 py-12 text-center',
        className,
      )}
    >
      <span
        aria-hidden="true"
        className="flex size-12 items-center justify-center rounded-full bg-bg text-brand"
      >
        <TriangleAlert size={24} />
      </span>
      <h3 className="text-kt-md font-medium text-fg">{title}</h3>
      <p className="max-w-md text-kt-base text-fg-muted">{description}</p>
      {onRetry ? (
        <Button
          variant="secondary"
          loading={retrying}
          onClick={onRetry}
          iconLeft={<RefreshCw size={16} aria-hidden="true" />}
          className="mt-1"
        >
          Réessayer
        </Button>
      ) : null}
    </div>
  );
}
