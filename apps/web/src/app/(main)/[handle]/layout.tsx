import type { Metadata } from 'next';
import { notFound } from 'next/navigation';
import type { ReactNode } from 'react';
import { ROUTES, type ChannelDTO } from '@kelvyntube/shared';
import { api } from '@/lib/api';
import { parseHandleSegment } from '@/lib/nav';
import { ChannelShell } from '@/components/channel/ChannelShell';

/**
 * ═══════════════════════════════════════════════════════════════════════════
 *  PAGE DE CHAÎNE — layout partagé par tous les onglets
 *  Le segment d'URL est `@handle` ; un format invalide déclenche `notFound()`.
 * ═══════════════════════════════════════════════════════════════════════════
 */

interface ChannelRouteProps {
  params: Promise<{ handle: string }>;
}

/** Charge la chaîne côté serveur pour les métadonnées (échec silencieux). */
async function loadChannel(handle: string): Promise<ChannelDTO | null> {
  try {
    return await api.get<ChannelDTO>(ROUTES.channels.byHandle(handle));
  } catch {
    return null;
  }
}

export async function generateMetadata({ params }: ChannelRouteProps): Promise<Metadata> {
  const { handle: segment } = await params;
  const handle = parseHandleSegment(segment);
  if (!handle) return { title: 'Chaîne introuvable' };

  const channel = await loadChannel(handle);
  if (!channel) return { title: `@${handle}` };

  // Le template du layout racine ajoute « — Kelvyn Tube ».
  const title = `${channel.name} (@${channel.handle})`;
  const description =
    channel.description?.slice(0, 200) ??
    `Découvre les vidéos de ${channel.name} sur Kelvyn Tube.`;

  return {
    title,
    description,
    openGraph: {
      type: 'profile',
      title: `${title} — Kelvyn Tube`,
      description,
      images: channel.bannerUrl ? [{ url: channel.bannerUrl }] : undefined,
    },
    twitter: {
      card: 'summary_large_image',
      title: `${title} — Kelvyn Tube`,
      description,
      images: channel.bannerUrl ? [channel.bannerUrl] : undefined,
    },
  };
}

export default async function ChannelLayout({
  children,
  params,
}: ChannelRouteProps & { children: ReactNode }) {
  const { handle: segment } = await params;
  const handle = parseHandleSegment(segment);
  if (!handle) notFound();

  return <ChannelShell handle={handle}>{children}</ChannelShell>;
}
