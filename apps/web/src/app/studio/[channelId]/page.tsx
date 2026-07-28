import { Suspense } from 'react';
import type { Metadata } from 'next';
import { Skeleton } from '@kelvyntube/ui';
import { OverviewScreen } from '@/components/studio/OverviewScreen';

export const metadata: Metadata = { title: 'Tableau de bord' };

function OverviewFallback() {
  return (
    <div className="grid gap-3 sm:grid-cols-2 xl:grid-cols-4">
      {Array.from({ length: 8 }).map((_, index) => (
        <Skeleton key={index} variant="rect" className="h-36 w-full rounded-kt" />
      ))}
    </div>
  );
}

/** `/studio/[channelId]` — vue d'ensemble de la chaîne. */
export default function StudioOverviewPage() {
  return (
    <Suspense fallback={<OverviewFallback />}>
      <OverviewScreen />
    </Suspense>
  );
}
