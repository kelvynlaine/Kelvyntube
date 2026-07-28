'use client';

import { AlertTriangle } from 'lucide-react';
import { Button, EmptyState, VideoCardSkeleton } from '@kelvyntube/ui';
import { errorMessage } from './queries';

/**
 * Blocs d'état transverses aux onglets de chaîne :
 * squelettes, erreur avec relance, bouton « Charger plus ».
 */

export function ChannelGridSkeleton({ count = 8 }: { count?: number }) {
  return (
    <div className="kt-video-grid" aria-hidden="true">
      {Array.from({ length: count }, (_, i) => (
        <VideoCardSkeleton key={i} />
      ))}
    </div>
  );
}

export function ChannelRowSkeleton({ count = 5 }: { count?: number }) {
  return (
    <div className="flex gap-4 overflow-hidden" aria-hidden="true">
      {Array.from({ length: count }, (_, i) => (
        <VideoCardSkeleton key={i} className="w-[220px] shrink-0 feed-3:w-[260px]" />
      ))}
    </div>
  );
}

export interface ChannelErrorStateProps {
  error: unknown;
  onRetry?: () => void;
  title?: string;
}

export function ChannelErrorState({ error, onRetry, title }: ChannelErrorStateProps) {
  return (
    <EmptyState
      icon={<AlertTriangle size={28} />}
      title={title ?? 'Chargement impossible'}
      description={errorMessage(error)}
      action={
        onRetry ? (
          <Button variant="secondary" onClick={onRetry}>
            Réessayer
          </Button>
        ) : undefined
      }
    />
  );
}

export interface LoadMoreProps {
  hasNextPage: boolean;
  isFetchingNextPage: boolean;
  onLoadMore: () => void;
  label?: string;
}

export function LoadMoreButton({
  hasNextPage,
  isFetchingNextPage,
  onLoadMore,
  label = 'Afficher plus',
}: LoadMoreProps) {
  if (!hasNextPage) return null;
  return (
    <div className="mt-8 flex justify-center">
      <Button
        variant="outline"
        size="lg"
        loading={isFetchingNextPage}
        onClick={onLoadMore}
      >
        {label}
      </Button>
    </div>
  );
}
