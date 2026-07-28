import type { Metadata } from 'next';
import { Suspense } from 'react';
import { LibrarySkeleton } from '@/components/library/LibraryShell';
import { SystemPlaylistView } from '@/components/library/SystemPlaylistView';

export const metadata: Metadata = {
  title: 'Vidéos likées',
  description: 'Toutes les vidéos auxquelles vous avez mis un « j’aime ».',
};

/** Playlist système « Vidéos likées ». */
export default function LikeesPage() {
  return (
    <Suspense fallback={<LibrarySkeleton variant="playlist" />}>
      <SystemPlaylistView kind="LIKED" />
    </Suspense>
  );
}
