import { Suspense } from 'react';
import type { Metadata } from 'next';
import { Skeleton } from '@kelvyntube/ui';
import { SubscribersScreen } from '@/components/studio/SubscribersScreen';

export const metadata: Metadata = { title: 'Abonnés' };

/** `/studio/[channelId]/abonnes` — évolution et origine des abonnés. */
export default function StudioSubscribersPage() {
  return (
    <Suspense fallback={<Skeleton variant="rect" className="h-[520px] w-full rounded-kt" />}>
      <SubscribersScreen />
    </Suspense>
  );
}
