import { Suspense } from 'react';
import type { Metadata } from 'next';
import { Skeleton } from '@kelvyntube/ui';
import { VideoEditScreen } from '@/components/studio/VideoEditScreen';

export const metadata: Metadata = { title: 'Détails de la vidéo' };

/** `/studio/[channelId]/videos/[videoId]` — édition et analytics d'une vidéo. */
export default function StudioVideoDetailPage() {
  return (
    <Suspense fallback={<Skeleton variant="rect" className="h-[520px] w-full rounded-kt" />}>
      <VideoEditScreen />
    </Suspense>
  );
}
