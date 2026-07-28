'use client';

import Link from 'next/link';
import { useState, type ReactNode } from 'react';
import { UserRoundX } from 'lucide-react';
import { formatCompactNumber } from '@kelvyntube/shared';
import { Avatar, EmptyState, Skeleton, VerifiedBadge } from '@kelvyntube/ui';
import { PATHS } from '@/lib/nav';
import { ChannelAboutModal } from './ChannelAboutModal';
import { ChannelSubscribe } from './ChannelSubscribe';
import { ChannelTabs } from './ChannelTabs';
import { ChannelErrorState } from './ChannelStates';
import { ShareChannelButton } from './ShareChannelButton';
import { isNotFound, useChannel } from './queries';

export interface ChannelShellProps {
  handle: string;
  children: ReactNode;
}

/** Squelette de l'en-tête (bannière + avatar + métadonnées). */
function ChannelHeaderSkeleton() {
  return (
    <div className="flex flex-col gap-4" aria-hidden="true">
      <Skeleton className="-mx-4 h-[clamp(96px,17vw,240px)] rounded-none feed-3:-mx-6 feed-3:rounded-kt" />
      <div className="flex items-center gap-4">
        {/* Même dimensionnement que l'avatar réel : aucun saut de mise en page. */}
        <Skeleton variant="circle" className="size-16 shrink-0 xs:size-20 feed-3:size-40" />
        <div className="flex min-w-0 flex-1 flex-col gap-3">
          <Skeleton variant="text" className="h-6 w-48" />
          <Skeleton variant="text" className="h-4 w-64" />
          <Skeleton variant="text" className="h-4 w-40" />
        </div>
      </div>
    </div>
  );
}

/**
 * Coquille commune à tous les onglets de chaîne : bannière, identité,
 * actions (abonnement / propriétaire) et barre d'onglets collante.
 * Les onglets enfants relisent la même entrée de cache via `useChannel`.
 */
export function ChannelShell({ handle, children }: ChannelShellProps) {
  const { data: channel, isPending, isError, error, refetch } = useChannel(handle);
  const [aboutOpen, setAboutOpen] = useState(false);

  if (isPending) return <ChannelHeaderSkeleton />;

  if (isError) {
    if (isNotFound(error)) {
      return (
        <EmptyState
          icon={<UserRoundX size={28} />}
          title="Chaîne introuvable"
          description={`Aucune chaîne ne correspond à @${handle}.`}
          action={
            <Link href={PATHS.home} className="kt-btn-secondary h-9">
              Retour à l’accueil
            </Link>
          }
        />
      );
    }
    return <ChannelErrorState error={error} onRetry={() => void refetch()} />;
  }

  const isOwner = channel.viewer.isOwner;

  return (
    <div className="flex flex-col">
      {/* ── Bannière 16:9 recadrée : pleine largeur sur mobile, arrondie
             à partir du desktop (les marges négatives annulent la gouttière
             du conteneur `AppShell`). ────────────────────────────────────── */}
      {channel.bannerUrl ? (
        <div className="-mx-4 h-[clamp(96px,17vw,240px)] overflow-hidden bg-bg-elevated feed-3:-mx-6 feed-3:rounded-kt">
          <img
            src={channel.bannerUrl}
            alt=""
            className="size-full object-cover"
            decoding="async"
          />
        </div>
      ) : null}

      {/* ── Identité ───────────────────────────────────────────────────── */}
      {/*
        Sur mobile l'avatar reste sur la même ligne que l'identité (comportement
        YouTube) : empilé, il consommait 80 px de hauteur utile pour rien.
        Il est aussi réduit à 64 px sous 480 px pour laisser respirer le nom.
      */}
      <header className="flex flex-row items-start gap-4 py-4 feed-3:items-center feed-3:gap-6 feed-3:py-6">
        <Avatar
          name={channel.name}
          src={channel.avatarUrl}
          size="xl"
          alt={`Avatar de ${channel.name}`}
          className="size-16 shrink-0 text-kt-md xs:size-20 xs:text-kt-lg feed-3:size-40 feed-3:text-[56px]"
        />

        <div className="flex min-w-0 flex-1 flex-col gap-2">
          {/* `text-kt-lg` sous 480 px : un nom long tenait sur trois lignes. */}
          <h1 className="flex min-w-0 items-center gap-2 text-kt-lg font-bold text-fg xs:text-kt-xl">
            <span className="min-w-0 break-words">{channel.name}</span>
            {channel.verified ? <VerifiedBadge size={16} /> : null}
          </h1>

          <p className="flex flex-wrap items-center gap-x-2 text-kt-base text-fg-muted">
            <span className="font-medium text-fg">@{channel.handle}</span>
            <span aria-hidden="true">•</span>
            <span>{formatCompactNumber(channel.subscriberCount)} abonnés</span>
            <span aria-hidden="true">•</span>
            <span>{formatCompactNumber(channel.videoCount)} vidéos</span>
          </p>

          {/* Description tronquée sur une ligne + « ...plus » */}
          <button
            type="button"
            onClick={() => setAboutOpen(true)}
            aria-haspopup="dialog"
            aria-label="Voir la description complète de la chaîne"
            className="flex max-w-2xl items-baseline gap-1 rounded text-left text-kt-base text-fg-muted transition-colors hover:text-fg kt-focus-ring"
          >
            <span className="kt-clamp-1 min-w-0">
              {channel.description?.trim() || 'Aucune description'}
            </span>
            <span aria-hidden="true" className="shrink-0 font-medium text-fg">
              ...plus
            </span>
          </button>

          {/* Actions */}
          <div className="mt-1 flex flex-wrap items-center gap-2">
            {isOwner ? (
              <>
                <Link
                  href={PATHS.studioCustomize(channel.id)}
                  className="kt-btn-secondary h-9"
                >
                  Personnaliser la chaîne
                </Link>
                <Link href={PATHS.studioVideos(channel.id)} className="kt-btn-secondary h-9">
                  Gérer les vidéos
                </Link>
              </>
            ) : (
              <ChannelSubscribe channel={channel} />
            )}
            <ShareChannelButton handle={channel.handle} />
          </div>
        </div>
      </header>

      <ChannelTabs handle={channel.handle} />

      <div className="pt-6">{children}</div>

      <ChannelAboutModal
        channel={channel}
        open={aboutOpen}
        onClose={() => setAboutOpen(false)}
      />
    </div>
  );
}
