import { Suspense } from 'react';
import type { Metadata } from 'next';
import { Skeleton } from '@kelvyntube/ui';
import { UploadScreen } from '@/components/studio/UploadScreen';

export const metadata: Metadata = { title: 'Mettre en ligne' };

/** `/studio/[channelId]/upload` — upload resumable et suivi du transcodage. */
export default function StudioUploadPage() {
  return (
    <Suspense fallback={<Skeleton variant="rect" className="h-[420px] w-full rounded-kt" />}>
      <UploadScreen />
    </Suspense>
  );
}
