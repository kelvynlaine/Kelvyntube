import { Suspense } from 'react';
import type { Metadata } from 'next';
import { Skeleton } from '@kelvyntube/ui';
import { CommentsModerationScreen } from '@/components/studio/CommentsModerationScreen';

export const metadata: Metadata = { title: 'Commentaires' };

/** `/studio/[channelId]/commentaires` — modération centralisée. */
export default function StudioCommentsPage() {
  return (
    <Suspense fallback={<Skeleton variant="rect" className="h-[520px] w-full rounded-kt" />}>
      <CommentsModerationScreen />
    </Suspense>
  );
}
