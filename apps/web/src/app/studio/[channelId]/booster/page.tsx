import { Suspense } from 'react';
import type { Metadata } from 'next';
import { Skeleton } from '@kelvyntube/ui';
import { BoostScreen } from '@/components/studio/BoostScreen';

export const metadata: Metadata = { title: 'Booster d’engagement' };

/**
 * `/studio/[channelId]/booster` — générateur de statistiques SIMULÉES
 * (outil de développement / démonstration, jamais de l'audience réelle).
 */
export default function StudioBoostPage() {
  return (
    <Suspense fallback={<Skeleton variant="rect" className="h-[520px] w-full rounded-kt" />}>
      <BoostScreen />
    </Suspense>
  );
}
