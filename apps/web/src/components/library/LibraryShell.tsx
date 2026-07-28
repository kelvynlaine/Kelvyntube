'use client';

import Link from 'next/link';
import { ChevronRight, LogIn } from 'lucide-react';
import type { ReactNode } from 'react';
import {
  Button,
  EmptyState,
  Skeleton,
  VideoCardSkeleton,
  cn,
} from '@kelvyntube/ui';
import { useAuth } from '@/lib/auth-context';
import { useInfiniteScroll } from './hooks';

/**
 * ═══════════════════════════════════════════════════════════════════════════
 *  COQUILLE COMMUNE DES PAGES DE LA BIBLIOTHÈQUE
 *  Conteneur, en-têtes de section, garde d'authentification et squelettes.
 *  La TopBar et la Sidebar sont fournies par le layout `(main)` parent.
 * ═══════════════════════════════════════════════════════════════════════════
 */

/**
 * Conteneur de page. Le layout `(main)` fournit déjà la gouttière et le
 * `padding` : on se contente ici de brider la largeur de lecture.
 */
export function LibraryPage({
  children,
  className,
}: {
  children: ReactNode;
  className?: string;
}) {
  return (
    <div className={cn('mx-auto w-full max-w-[1600px]', className)}>{children}</div>
  );
}

/** Titre de page avec actions optionnelles à droite. */
export function LibraryHeader({
  icon,
  title,
  subtitle,
  actions,
}: {
  icon?: ReactNode;
  title: string;
  subtitle?: ReactNode;
  actions?: ReactNode;
}) {
  return (
    <header className="mb-6 flex flex-wrap items-center justify-between gap-4">
      <div className="flex min-w-0 items-center gap-3">
        {icon ? (
          <span aria-hidden="true" className="text-fg-muted">
            {icon}
          </span>
        ) : null}
        <div className="min-w-0">
          <h1 className="truncate text-kt-xl font-medium text-fg">{title}</h1>
          {subtitle ? (
            <p className="truncate text-kt-base text-fg-muted">{subtitle}</p>
          ) : null}
        </div>
      </div>
      {actions ? <div className="flex items-center gap-2">{actions}</div> : null}
    </header>
  );
}

/** En-tête de section avec lien « Tout afficher ». */
export function SectionHeader({
  icon,
  title,
  href,
  actionLabel = 'Tout afficher',
}: {
  icon?: ReactNode;
  title: string;
  href?: string;
  actionLabel?: string;
}) {
  return (
    <div className="mb-3 flex items-center justify-between gap-4">
      <h2 className="flex items-center gap-2 text-kt-lg font-medium text-fg">
        {icon ? (
          <span aria-hidden="true" className="text-fg-muted">
            {icon}
          </span>
        ) : null}
        {title}
      </h2>
      {href ? (
        <Link
          href={href}
          className="inline-flex items-center gap-1 rounded-pill px-3 py-1.5 text-kt-base font-medium text-fg transition-colors hover:bg-bg-hover kt-focus-ring"
        >
          {actionLabel}
          <ChevronRight size={16} aria-hidden="true" />
        </Link>
      ) : null}
    </div>
  );
}

/** Rangée horizontale défilante (aperçus de la page Bibliothèque). */
export function HorizontalScroller({
  children,
  label,
}: {
  children: ReactNode;
  label: string;
}) {
  return (
    <ul
      aria-label={label}
      className="kt-scroll flex snap-x gap-4 overflow-x-auto pb-2"
    >
      {children}
    </ul>
  );
}

/** Élément de la rangée horizontale — largeur fixe façon YouTube. */
export function HorizontalItem({ children }: { children: ReactNode }) {
  return (
    <li className="w-[220px] shrink-0 snap-start feed-3:w-[260px]">{children}</li>
  );
}

// ── Squelettes ────────────────────────────────────────────────────────────

export function VideoGridSkeleton({ count = 8 }: { count?: number }) {
  return (
    <div className="kt-video-grid" aria-hidden="true">
      {Array.from({ length: count }, (_, index) => (
        <VideoCardSkeleton key={index} />
      ))}
    </div>
  );
}

export function VideoListSkeleton({ count = 6 }: { count?: number }) {
  return (
    <div className="flex flex-col gap-4" aria-hidden="true">
      {Array.from({ length: count }, (_, index) => (
        <VideoCardSkeleton key={index} layout="list" />
      ))}
    </div>
  );
}

export function PlaylistLayoutSkeleton() {
  return (
    <div className="flex flex-col gap-6 lg:flex-row" aria-hidden="true">
      <Skeleton className="h-[420px] w-full rounded-kt-lg lg:w-[360px]" />
      <div className="flex min-w-0 flex-1 flex-col gap-3">
        {Array.from({ length: 6 }, (_, index) => (
          <VideoCardSkeleton key={index} layout="compact" />
        ))}
      </div>
    </div>
  );
}

/** Squelette générique d'une page de la bibliothèque. */
export function LibrarySkeleton({
  variant = 'grid',
}: {
  variant?: 'grid' | 'list' | 'playlist';
}) {
  return (
    <LibraryPage>
      <Skeleton className="mb-6 h-8 w-56" />
      {variant === 'grid' ? <VideoGridSkeleton /> : null}
      {variant === 'list' ? <VideoListSkeleton /> : null}
      {variant === 'playlist' ? <PlaylistLayoutSkeleton /> : null}
    </LibraryPage>
  );
}

// ── Garde d'authentification ──────────────────────────────────────────────

/**
 * Toutes les pages de la bibliothèque exigent un compte.
 * Chargement -> squelette ; visiteur anonyme -> `EmptyState` avec bouton de
 * connexion (`requireAuth` ouvre la modale). Aucune redirection brutale.
 */
export function LibraryAuthGate({
  children,
  icon,
  title,
  description,
  skeleton = 'grid',
}: {
  children: ReactNode;
  icon?: ReactNode;
  title: string;
  description: string;
  skeleton?: 'grid' | 'list' | 'playlist';
}) {
  const { user, loading, requireAuth } = useAuth();

  if (loading) return <LibrarySkeleton variant={skeleton} />;

  if (!user) {
    return (
      <LibraryPage>
        <EmptyState
          icon={icon ?? <LogIn size={28} aria-hidden="true" />}
          title={title}
          description={description}
          action={
            <Button variant="primary" onClick={() => requireAuth(title)}>
              Se connecter
            </Button>
          }
        />
      </LibraryPage>
    );
  }

  return <>{children}</>;
}

// ── Pagination infinie ────────────────────────────────────────────────────

/**
 * Sentinelle de fin de liste : déclenche le chargement de la page suivante
 * dès qu'elle approche du viewport.
 */
export function InfiniteSentinel({
  hasMore,
  loading,
  onLoadMore,
  children,
}: {
  hasMore: boolean;
  loading: boolean;
  onLoadMore: () => void;
  /** Squelettes affichés pendant le chargement de la page suivante. */
  children?: ReactNode;
}) {
  const ref = useInfiniteScroll(() => {
    if (hasMore && !loading) onLoadMore();
  }, hasMore && !loading);

  if (!hasMore) return null;

  return (
    <div ref={ref} className="pt-4">
      {loading ? children ?? null : null}
      <span className="sr-only" role="status">
        {loading ? 'Chargement de la suite…' : ''}
      </span>
    </div>
  );
}
