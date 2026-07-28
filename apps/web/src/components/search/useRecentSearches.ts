'use client';

import { useCallback, useEffect, useState } from 'react';

/**
 * ═══════════════════════════════════════════════════════════════════════════
 *  HISTORIQUE DE RECHERCHE LOCAL
 *  Les 5 dernières requêtes sont conservées dans `localStorage` sous la clé
 *  `kt_recent_searches`. Aucune donnée n'est envoyée au serveur.
 * ═══════════════════════════════════════════════════════════════════════════
 */

export const RECENT_SEARCHES_KEY = 'kt_recent_searches';
export const MAX_RECENT_SEARCHES = 5;

/** Événement interne : synchronise les instances montées dans le même onglet. */
const RECENT_SEARCHES_EVENT = 'kt:recent-searches';

/** Lecture défensive : le stockage peut être indisponible ou corrompu. */
function readRecentSearches(): string[] {
  if (typeof window === 'undefined') return [];
  try {
    const raw = window.localStorage.getItem(RECENT_SEARCHES_KEY);
    if (!raw) return [];
    const parsed: unknown = JSON.parse(raw);
    if (!Array.isArray(parsed)) return [];
    return parsed
      .filter((value): value is string => typeof value === 'string' && value.trim().length > 0)
      .slice(0, MAX_RECENT_SEARCHES);
  } catch {
    return [];
  }
}

function writeRecentSearches(list: string[]): void {
  if (typeof window === 'undefined') return;
  try {
    window.localStorage.setItem(RECENT_SEARCHES_KEY, JSON.stringify(list));
  } catch {
    // Mode navigation privée / quota dépassé : l'historique est simplement perdu.
  }
  window.dispatchEvent(new Event(RECENT_SEARCHES_EVENT));
}

/** Ajoute une requête en tête de l'historique (déduplication insensible à la casse). */
export function pushRecentSearch(query: string): void {
  const value = query.trim();
  if (!value) return;
  const key = value.toLocaleLowerCase('fr-FR');
  const next = [
    value,
    ...readRecentSearches().filter((item) => item.toLocaleLowerCase('fr-FR') !== key),
  ].slice(0, MAX_RECENT_SEARCHES);
  writeRecentSearches(next);
}

/** Retire une entrée précise de l'historique. */
export function removeRecentSearch(query: string): void {
  const key = query.trim().toLocaleLowerCase('fr-FR');
  writeRecentSearches(
    readRecentSearches().filter((item) => item.toLocaleLowerCase('fr-FR') !== key),
  );
}

/** Vide entièrement l'historique. */
export function clearRecentSearches(): void {
  writeRecentSearches([]);
}

export interface UseRecentSearches {
  /** Les 5 dernières requêtes, de la plus récente à la plus ancienne. */
  items: string[];
  push: (query: string) => void;
  remove: (query: string) => void;
  clear: () => void;
}

/**
 * Historique de recherche réactif.
 * La lecture est faite après le montage afin d'éviter toute désynchronisation
 * d'hydratation (le serveur ne connaît pas `localStorage`).
 */
export function useRecentSearches(): UseRecentSearches {
  const [items, setItems] = useState<string[]>([]);

  useEffect(() => {
    const sync = () => setItems(readRecentSearches());
    sync();
    window.addEventListener(RECENT_SEARCHES_EVENT, sync);
    window.addEventListener('storage', sync);
    return () => {
      window.removeEventListener(RECENT_SEARCHES_EVENT, sync);
      window.removeEventListener('storage', sync);
    };
  }, []);

  const push = useCallback((query: string) => pushRecentSearch(query), []);
  const remove = useCallback((query: string) => removeRecentSearch(query), []);
  const clear = useCallback(() => clearRecentSearches(), []);

  return { items, push, remove, clear };
}
