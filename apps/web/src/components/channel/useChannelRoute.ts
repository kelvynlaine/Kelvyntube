'use client';

import { useParams } from 'next/navigation';
import { parseHandleSegment } from '@/lib/nav';
import { useChannel } from './queries';

/**
 * Handle de la chaîne courante extrait de l'URL (`/@kelvyn` -> `kelvyn`).
 * Le layout a déjà rejeté les segments invalides : la chaîne vide n'arrive
 * qu'en rendu de secours et désactive simplement les requêtes.
 */
export function useChannelHandle(): string {
  const params = useParams<{ handle: string | string[] }>();
  const raw = Array.isArray(params?.handle) ? params.handle[0] : params?.handle;
  return raw ? (parseHandleSegment(raw) ?? '') : '';
}

/** Chaîne courante + son handle, pour les onglets. */
export function useCurrentChannel() {
  const handle = useChannelHandle();
  const query = useChannel(handle);
  return { handle, channel: query.data, ...query };
}
