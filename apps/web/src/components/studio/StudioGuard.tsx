'use client';

import Link from 'next/link';
import type { ReactNode } from 'react';
import { Lock, ShieldAlert, TriangleAlert } from 'lucide-react';
import { EmptyState, Skeleton, cn } from '@kelvyntube/ui';
import { useAuth } from '@/lib/auth-context';
import { PATHS } from '@/lib/nav';

/**
 * ═══════════════════════════════════════════════════════════════════════════
 *  GARDE D'ACCÈS DU STUDIO
 *  Aucune redirection brutale : on explique pourquoi l'accès est refusé et
 *  on propose une sortie. Pendant `useAuth().loading`, on montre un squelette
 *  de la mise en page pour éviter le clignotement.
 * ═══════════════════════════════════════════════════════════════════════════
 */

/** Lien stylé comme un bouton primaire (les écrans de garde n'ont pas de shell). */
function LinkButton({
  href,
  children,
  variant = 'primary',
}: {
  href: string;
  children: ReactNode;
  variant?: 'primary' | 'secondary';
}) {
  return (
    <Link
      href={href}
      className={cn(
        'inline-flex h-11 items-center gap-2 rounded-pill px-4 text-kt-base font-medium transition-colors kt-focus-ring feed-3:h-9',
        variant === 'primary'
          ? 'bg-fg text-fg-inverse hover:opacity-90'
          : 'bg-bg-elevated text-fg hover:bg-bg-active',
      )}
    >
      {children}
    </Link>
  );
}

function GuardScreen({
  icon,
  title,
  description,
  actions,
}: {
  icon: ReactNode;
  title: string;
  description: string;
  actions: ReactNode;
}) {
  return (
    <div className="flex min-h-[100dvh] items-center justify-center bg-bg px-4">
      <EmptyState
        icon={icon}
        title={title}
        description={description}
        action={<div className="flex flex-wrap items-center justify-center gap-2">{actions}</div>}
      />
    </div>
  );
}

/** Squelette affiché pendant la résolution de la session. */
export function StudioShellSkeleton() {
  return (
    <div className="min-h-[100dvh] bg-bg">
      <div className="fixed inset-y-0 left-0 hidden w-sidebar border-r border-border p-4 lg:block">
        <div className="flex flex-col items-center gap-3 py-4">
          <Skeleton variant="circle" className="size-20" />
          <Skeleton variant="text" className="h-4 w-32" />
          <Skeleton variant="text" className="h-3 w-20" />
        </div>
        <div className="mt-6 flex flex-col gap-2">
          {Array.from({ length: 6 }).map((_, index) => (
            <Skeleton key={index} variant="rect" className="h-10 w-full rounded-kt" />
          ))}
        </div>
      </div>
      <div className="lg:pl-sidebar">
        <div className="flex h-topbar items-center gap-3 border-b border-border px-4">
          <Skeleton variant="text" className="h-5 w-56" />
          <Skeleton variant="rect" className="ml-auto h-9 w-28 rounded-pill" />
          <Skeleton variant="circle" className="size-8" />
        </div>
        <div className="grid gap-4 p-6 sm:grid-cols-2 xl:grid-cols-4">
          {Array.from({ length: 8 }).map((_, index) => (
            <Skeleton key={index} variant="rect" className="h-32 w-full rounded-kt" />
          ))}
        </div>
      </div>
    </div>
  );
}

export interface StudioGuardProps {
  /** Chaîne demandée par l'URL. Vide sur `/studio` (page de redirection). */
  channelId: string;
  children: ReactNode;
}

/**
 * Vérifie session + propriété de la chaîne avant de rendre le Studio.
 */
export function StudioGuard({ channelId, children }: StudioGuardProps) {
  const { user, loading } = useAuth();

  if (loading) return <StudioShellSkeleton />;

  if (!user) {
    return (
      <GuardScreen
        icon={<Lock size={40} aria-hidden="true" />}
        title="Connexion requise"
        description="Kelvyn Studio est réservé aux créateurs connectés. Connectez-vous pour accéder au tableau de bord de votre chaîne."
        actions={
          <>
            <LinkButton href={PATHS.login}>Se connecter</LinkButton>
            <LinkButton href={PATHS.home} variant="secondary">
              Retour à Kelvyn Tube
            </LinkButton>
          </>
        }
      />
    );
  }

  if (user.channels.length === 0) {
    return (
      <GuardScreen
        icon={<TriangleAlert size={40} aria-hidden="true" />}
        title="Aucune chaîne sur ce compte"
        description="Créez d'abord une chaîne : c'est elle qui héberge vos vidéos, vos statistiques et vos abonnés."
        actions={
          <>
            <LinkButton href={PATHS.onboarding}>Créer ma chaîne</LinkButton>
            <LinkButton href={PATHS.home} variant="secondary">
              Retour à Kelvyn Tube
            </LinkButton>
          </>
        }
      />
    );
  }

  // `/studio` sans identifiant : la page de redirection s'en charge.
  if (!channelId) return <>{children}</>;

  const owned = user.channels.some((channel) => channel.id === channelId);
  if (!owned) {
    const fallback = user.channels[0];
    return (
      <GuardScreen
        icon={<ShieldAlert size={40} aria-hidden="true" />}
        title="Chaîne inaccessible"
        description="Vous n'êtes pas propriétaire de cette chaîne. Vérifiez le lien ou basculez sur l'une de vos chaînes."
        actions={
          <>
            <LinkButton href={PATHS.studioChannel(fallback.id)}>
              Ouvrir le Studio de {fallback.name}
            </LinkButton>
            <LinkButton href={PATHS.home} variant="secondary">
              Retour à Kelvyn Tube
            </LinkButton>
          </>
        }
      />
    );
  }

  return <>{children}</>;
}
