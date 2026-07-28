'use client';

import { Suspense } from 'react';
import { useSearchParams } from 'next/navigation';
import { Spinner } from '@kelvyntube/ui';
import { ShortsFeed } from '@/components/feed';

/**
 * Feed Shorts plein écran — volontairement HORS du layout `(main)` :
 * ni barre latérale, ni barre supérieure, un Short occupe tout l'écran.
 */
export default function ShortsPage() {
  return (
    <Suspense fallback={<ShortsFallback />}>
      <ShortsPageContent />
    </Suspense>
  );
}

function ShortsFallback() {
  return (
    <div className="flex h-[100dvh] w-full items-center justify-center bg-black">
      <Spinner size={36} className="text-white" label="Chargement des Shorts" />
    </div>
  );
}

function ShortsPageContent() {
  const searchParams = useSearchParams();
  // `?v=<id>` : le feed démarre sur ce Short.
  const seedVideoId = searchParams.get('v');

  return <ShortsFeed seedVideoId={seedVideoId} />;
}
