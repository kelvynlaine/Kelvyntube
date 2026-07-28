'use client';

import { useParams, usePathname, useRouter, useSearchParams } from 'next/navigation';
import { useCallback, useMemo } from 'react';

/**
 * ═══════════════════════════════════════════════════════════════════════════
 *  ÉTAT D'URL DU STUDIO
 *  Les filtres, la pagination et la période vivent dans la query string :
 *  un lien de Studio partagé rouvre exactement le même écran.
 * ═══════════════════════════════════════════════════════════════════════════
 */

export type QueryPatch = Record<string, string | number | null | undefined>;

export interface StudioUrlState {
  params: URLSearchParams;
  /** Lit un paramètre (chaîne vide traitée comme absente). */
  get: (key: string) => string | null;
  /** Applique un correctif ; `null`/`undefined` supprime la clé. */
  setQuery: (patch: QueryPatch, options?: { resetPage?: boolean }) => void;
  /** Construit une URL sans naviguer (pour les `<Link>`). */
  buildHref: (patch: QueryPatch, options?: { resetPage?: boolean }) => string;
}

export function useStudioUrlState(): StudioUrlState {
  const router = useRouter();
  const pathname = usePathname();
  const searchParams = useSearchParams();

  // `useSearchParams` renvoie un objet en lecture seule : on travaille sur une copie.
  const params = useMemo(() => new URLSearchParams(searchParams.toString()), [searchParams]);

  const get = useCallback(
    (key: string) => {
      const value = params.get(key);
      return value === null || value === '' ? null : value;
    },
    [params],
  );

  const buildHref = useCallback(
    (patch: QueryPatch, options?: { resetPage?: boolean }) => {
      const next = new URLSearchParams(params.toString());
      for (const [key, value] of Object.entries(patch)) {
        if (value === null || value === undefined || value === '') next.delete(key);
        else next.set(key, String(value));
      }
      // Changer un filtre doit ramener à la première page du tableau.
      if (options?.resetPage) next.delete('page');
      const qs = next.toString();
      return qs ? `${pathname}?${qs}` : pathname;
    },
    [params, pathname],
  );

  const setQuery = useCallback(
    (patch: QueryPatch, options?: { resetPage?: boolean }) => {
      router.replace(buildHref(patch, options), { scroll: false });
    },
    [buildHref, router],
  );

  return { params, get, setQuery, buildHref };
}

/** Identifiant de chaîne du segment `[channelId]` de l'URL. */
export function useChannelId(): string {
  const params = useParams<{ channelId?: string | string[] }>();
  const raw = params?.channelId;
  return Array.isArray(raw) ? (raw[0] ?? '') : (raw ?? '');
}

/** Identifiant de vidéo du segment `[videoId]` de l'URL. */
export function useVideoId(): string {
  const params = useParams<{ videoId?: string | string[] }>();
  const raw = params?.videoId;
  return Array.isArray(raw) ? (raw[0] ?? '') : (raw ?? '');
}
