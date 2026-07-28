import type { Metadata } from 'next';
import { Suspense } from 'react';
import { SearchResults, SearchResultsSkeleton } from '@/components/search/SearchResults';

/**
 * ═══════════════════════════════════════════════════════════════════════════
 *  PAGE DE RÉSULTATS — /resultats?q=…&duration=…&uploadDate=…&type=…&sort=…
 *  Les pages de résultats ne sont jamais indexées (`robots: noindex`).
 * ═══════════════════════════════════════════════════════════════════════════
 */

interface ResultsPageProps {
  /** Next 15 : les paramètres d'URL sont asynchrones. */
  searchParams: Promise<Record<string, string | string[] | undefined>>;
}

/** Extrait la requête `q` (première occurrence si le paramètre est répété). */
function readQuery(params: Record<string, string | string[] | undefined>): string {
  const raw = params.q;
  const value = Array.isArray(raw) ? raw[0] : raw;
  return (value ?? '').trim();
}

export async function generateMetadata({
  searchParams,
}: ResultsPageProps): Promise<Metadata> {
  const params = await searchParams;
  const query = readQuery(params);

  return {
    // `absolute` évite l'application du gabarit « %s — Kelvyn Tube » du layout racine.
    title: { absolute: query ? `"${query}" — Kelvyn Tube` : 'Recherche — Kelvyn Tube' },
    description: query
      ? `Résultats de recherche pour « ${query} » sur Kelvyn Tube.`
      : 'Recherchez des vidéos, des chaînes et des playlists sur Kelvyn Tube.',
    robots: { index: false, follow: false },
  };
}

export default function ResultsPage() {
  return (
    // `useSearchParams` impose une frontière Suspense côté serveur.
    <Suspense
      fallback={
        // La gouttière vient du conteneur d'`AppShell` : pas de double marge.
        <div className="mx-auto w-full max-w-[1096px]">
          <SearchResultsSkeleton />
        </div>
      }
    >
      <SearchResults />
    </Suspense>
  );
}
