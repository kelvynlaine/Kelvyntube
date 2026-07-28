'use client';

import { useEffect, useRef, type ReactNode } from 'react';
import { Button, Spinner, cn } from '@kelvyntube/ui';

export interface InfiniteFeedProps {
  /** Reste-t-il une page à charger ? */
  hasNextPage: boolean;
  isFetchingNextPage: boolean;
  /** Déclenché quand la sentinelle entre dans le viewport. */
  onLoadMore: () => void;
  /** Échec du chargement de la page suivante. */
  hasError?: boolean;
  /** Marge de déclenchement anticipé (avant que la sentinelle soit visible). */
  rootMargin?: string;
  /** Message affiché en fin de liste. */
  endMessage?: ReactNode;
  className?: string;
}

/**
 * Défilement infini : une sentinelle observée par `IntersectionObserver`
 * demande la page suivante bien avant d'être atteinte par l'utilisateur.
 */
export function InfiniteFeed({
  hasNextPage,
  isFetchingNextPage,
  onLoadMore,
  hasError = false,
  rootMargin = '800px 0px',
  endMessage,
  className,
}: InfiniteFeedProps) {
  const sentinelRef = useRef<HTMLDivElement | null>(null);
  const loadMoreRef = useRef(onLoadMore);
  loadMoreRef.current = onLoadMore;

  useEffect(() => {
    const el = sentinelRef.current;
    if (!el) return;
    if (!hasNextPage || isFetchingNextPage || hasError) return;
    if (typeof IntersectionObserver === 'undefined') return;

    const observer = new IntersectionObserver(
      (entries) => {
        if (entries.some((entry) => entry.isIntersecting)) loadMoreRef.current();
      },
      { rootMargin },
    );
    observer.observe(el);
    return () => observer.disconnect();
  }, [hasNextPage, isFetchingNextPage, hasError, rootMargin]);

  return (
    <div className={cn('flex flex-col items-center gap-4 py-8', className)}>
      {/* Sentinelle : élément vide observé en bas de la liste */}
      <div ref={sentinelRef} aria-hidden="true" className="h-px w-full" />

      {isFetchingNextPage ? (
        <span
          role="status"
          aria-live="polite"
          className="flex items-center gap-2 text-kt-base text-fg-muted"
        >
          <Spinner size={20} />
          Chargement…
        </span>
      ) : null}

      {hasError ? (
        <div role="alert" className="flex flex-col items-center gap-2">
          <p className="text-kt-base text-fg-muted">
            Le chargement des vidéos suivantes a échoué.
          </p>
          <Button variant="secondary" onClick={() => loadMoreRef.current()}>
            Réessayer
          </Button>
        </div>
      ) : null}

      {!hasNextPage && !isFetchingNextPage && !hasError && endMessage ? (
        <p className="text-kt-base text-fg-muted">{endMessage}</p>
      ) : null}
    </div>
  );
}
