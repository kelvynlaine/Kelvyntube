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
    // Les largeurs répliquent exactement `THUMB_WIDTH` de `VideoCard` :
    // si le squelette et la carte divergent, la liste « saute » au moment où
    // les données arrivent (décalage de mise en page = mauvais CLS).
    <div className={cn('flex w-full', isList ? 'gap-2 xs:gap-4' : 'gap-2', className)}>
      <Skeleton
        className={cn(
          'aspect-video shrink-0 rounded-kt',
          isList
            ? 'w-[40%] min-w-[112px] max-w-[180px] xs:w-60 xs:max-w-none feed-3:w-[360px]'
            : 'w-[42%] min-w-[112px] max-w-[168px] xs:w-[168px] xs:max-w-none',
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
