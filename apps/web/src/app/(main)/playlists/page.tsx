import type { Metadata } from 'next';
import { Suspense } from 'react';
import { LibrarySkeleton } from '@/components/library/LibraryShell';
import { PlaylistsView } from '@/components/library/PlaylistsView';

export const metadata: Metadata = {
  title: 'Playlists',
  description: 'Créez et organisez vos playlists Kelvyn Tube.',
};

/** Grille de toutes les playlists de l'utilisateur. */
export default function PlaylistsPage() {
  return (
    <Suspense fallback={<LibrarySkeleton />}>
      <PlaylistsView />
    </Suspense>
  );
}
