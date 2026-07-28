import type { Metadata } from 'next';
import { Suspense } from 'react';
import { LibrarySkeleton } from '@/components/library/LibraryShell';
import { PlaylistDetailView } from '@/components/library/PlaylistDetailView';

export const metadata: Metadata = {
  title: 'Playlist',
  description: 'Détail d’une playlist Kelvyn Tube.',
};

/** Détail d'une playlist — `/playlist?list=<id>`. */
export default function PlaylistPage() {
  return (
    <Suspense fallback={<LibrarySkeleton variant="playlist" />}>
      <PlaylistDetailView />
    </Suspense>
  );
}
