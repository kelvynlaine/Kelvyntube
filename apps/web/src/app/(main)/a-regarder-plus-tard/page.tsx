import type { Metadata } from 'next';
import { Suspense } from 'react';
import { LibrarySkeleton } from '@/components/library/LibraryShell';
import { SystemPlaylistView } from '@/components/library/SystemPlaylistView';

export const metadata: Metadata = {
  title: 'À regarder plus tard',
  description: 'Les vidéos que vous avez mises de côté pour plus tard.',
};

/** Playlist système « À regarder plus tard ». */
export default function ARegarderPlusTardPage() {
  return (
    <Suspense fallback={<LibrarySkeleton variant="playlist" />}>
      <SystemPlaylistView kind="WATCH_LATER" />
    </Suspense>
  );
}
