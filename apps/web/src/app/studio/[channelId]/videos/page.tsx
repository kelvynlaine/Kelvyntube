import { Suspense } from 'react';
import type { Metadata } from 'next';
import { Skeleton } from '@kelvyntube/ui';
import { VideosScreen } from '@/components/studio/VideosScreen';

export const metadata: Metadata = { title: 'Contenu' };

/** `/studio/[channelId]/videos` — tableau de gestion des vidéos. */
export default function StudioVideosPage() {
  return (
    <Suspense
      fallback={
        <div className="flex flex-col gap-2">
          {Array.from({ length: 6 }).map((_, index) => (
            <Skeleton key={index} variant="rect" className="h-24 w-full rounded-kt" />
          ))}
        </div>
      }
    >
      <VideosScreen />
    </Suspense>
  );
}
