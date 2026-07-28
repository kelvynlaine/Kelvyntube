import { Suspense } from 'react';
import type { Metadata } from 'next';
import { Skeleton } from '@kelvyntube/ui';
import { AnalyticsScreen } from '@/components/studio/AnalyticsScreen';

export const metadata: Metadata = { title: 'Analytics' };

/** `/studio/[channelId]/analytics` — analytics de la chaîne. */
export default function StudioAnalyticsPage() {
  return (
    <Suspense fallback={<Skeleton variant="rect" className="h-[520px] w-full rounded-kt" />}>
      <AnalyticsScreen />
    </Suspense>
  );
}
