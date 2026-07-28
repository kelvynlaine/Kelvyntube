import type { Metadata } from 'next';
import { Suspense } from 'react';
import { LibrarySkeleton } from '@/components/library/LibraryShell';
import { MyVideosView } from '@/components/library/MyVideosView';

export const metadata: Metadata = {
  title: 'Vos vidéos',
  description: 'Accédez aux vidéos de votre chaîne dans Kelvyn Studio.',
};

/** Redirige vers le Studio de la chaîne active. */
export default function MesVideosPage() {
  return (
    <Suspense fallback={<LibrarySkeleton variant="list" />}>
      <MyVideosView />
    </Suspense>
  );
}
