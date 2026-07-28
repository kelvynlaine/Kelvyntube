import type { Metadata } from 'next';
import { Suspense } from 'react';
import { LibraryOverview } from '@/components/library/LibraryOverview';
import { LibrarySkeleton } from '@/components/library/LibraryShell';

export const metadata: Metadata = {
  title: 'Bibliothèque',
  description:
    'Votre bibliothèque Kelvyn Tube : historique, playlists, vidéos likées et vos vidéos.',
};

/** Page d'aperçu de la section Bibliothèque. */
export default function BibliothequePage() {
  return (
    <Suspense fallback={<LibrarySkeleton />}>
      <LibraryOverview />
    </Suspense>
  );
}
