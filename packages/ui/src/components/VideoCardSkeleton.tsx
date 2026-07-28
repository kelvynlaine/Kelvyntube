import { cn } from '../cn';
import { Skeleton } from './Skeleton';
import type { VideoCardLayout } from './VideoCard';

export interface VideoCardSkeletonProps {
  layout?: VideoCardLayout;
  /** Affiche l'emplacement de l'avatar de chaîne. */
  showChannel?: boolean;
  className?: string;
}

/** Squelette de chargement aligné sur les trois dispositions de `VideoCard`. */
export function VideoCardSkeleton({
  layout = 'grid',
  showChannel,
  className,
}: VideoCardSkeletonProps) {
  const withChannel = showChannel ?? layout !== 'compact';

  if (layout === 'grid') {
    return (
      <div className={cn('flex w-full flex-col gap-3', className)}>
        <Skeleton className="aspect-video w-full rounded-kt" />
        <div className="flex gap-3">
          {withChannel ? (
            <Skeleton variant="circle" className="size-10 shrink-0" />
          ) : null}
          <div className="flex min-w-0 flex-1 flex-col gap-2">
            <Skeleton variant="text" className="h-4 w-full" />
            <Skeleton variant="text" className="h-4 w-3/4" />
            <Skeleton variant="text" className="h-3 w-1/2" />
          </div>
        </div>
      </div>
    );
  }

  const isList = layout === 'list';

  return (
    <div className={cn('flex w-full', isList ? 'gap-4' : 'gap-2', className)}>
      <Skeleton
        className={cn(
          'aspect-video shrink-0 rounded-kt',
          isList ? 'w-40 xs:w-60 feed-3:w-[360px]' : 'w-[168px]',
        )}
      />
      <div className="flex min-w-0 flex-1 flex-col gap-2">
        <Skeleton variant="text" className={cn('h-4', isList ? 'w-2/3' : 'w-full')} />
        <Skeleton variant="text" className="h-3 w-1/2" />
        <Skeleton variant="text" className="h-3 w-2/5" />
      </div>
    </div>
  );
}
