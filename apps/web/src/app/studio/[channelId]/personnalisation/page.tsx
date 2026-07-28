import { Suspense } from 'react';
import type { Metadata } from 'next';
import { Skeleton } from '@kelvyntube/ui';
import { CustomizeScreen } from '@/components/studio/CustomizeScreen';

export const metadata: Metadata = { title: 'Personnalisation' };

/** `/studio/[channelId]/personnalisation` — image de marque et mise en page. */
export default function StudioCustomizePage() {
  return (
    <Suspense fallback={<Skeleton variant="rect" className="h-[520px] w-full rounded-kt" />}>
      <CustomizeScreen />
    </Suspense>
  );
}
