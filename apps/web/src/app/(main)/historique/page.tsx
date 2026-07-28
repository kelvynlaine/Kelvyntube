import type { Metadata } from 'next';
import { Suspense } from 'react';
import { HistoryView } from '@/components/library/HistoryView';
import { LibrarySkeleton } from '@/components/library/LibraryShell';

export const metadata: Metadata = {
  title: 'Historique',
  description: 'Retrouvez et gérez les vidéos que vous avez regardées.',
};

/** Historique de visionnage groupé par jour. */
export default function HistoriquePage() {
  return (
    <Suspense fallback={<LibrarySkeleton variant="list" />}>
      <HistoryView />
    </Suspense>
  );
}
