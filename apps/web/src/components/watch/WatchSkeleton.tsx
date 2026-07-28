import { Skeleton, VideoCardSkeleton } from '@kelvyntube/ui';

/**
 * Squelette de la page de visionnage — calqué sur la mise en page finale
 * pour éviter tout saut visuel à l'arrivée des données.
 */
export function WatchSkeleton() {
  return (
    <div
      aria-busy="true"
      aria-live="polite"
      className="mx-auto flex w-full max-w-[1754px] flex-col gap-6 px-4 pb-16 pt-4 min-[1015px]:flex-row min-[1015px]:items-start"
    >
      <span className="sr-only">Chargement de la vidéo…</span>

      <div className="flex min-w-0 flex-1 flex-col gap-3 min-[1015px]:max-w-[1280px]">
        <Skeleton className="-mx-4 aspect-video w-auto rounded-none min-[1015px]:mx-0 min-[1015px]:rounded-kt" />

        <Skeleton variant="text" className="mt-2 h-6 w-3/4" />
        <Skeleton variant="text" className="h-6 w-1/2" />

        <div className="mt-2 flex items-center gap-3">
          <Skeleton variant="circle" className="size-12 shrink-0" />
          <div className="flex flex-1 flex-col gap-2">
            <Skeleton variant="text" className="h-4 w-40" />
            <Skeleton variant="text" className="h-3 w-24" />
          </div>
          <Skeleton className="h-9 w-28 rounded-pill" />
        </div>

        <Skeleton className="mt-2 h-28 w-full rounded-kt" />

        <div className="mt-6 flex flex-col gap-6">
          {Array.from({ length: 3 }).map((_, index) => (
            <div key={index} className="flex gap-3">
              <Skeleton variant="circle" className="size-10 shrink-0" />
              <div className="flex flex-1 flex-col gap-2">
                <Skeleton variant="text" className="h-3 w-32" />
                <Skeleton variant="text" className="h-3 w-full" />
                <Skeleton variant="text" className="h-3 w-2/3" />
              </div>
            </div>
          ))}
        </div>
      </div>

      <aside className="w-full shrink-0 min-[1015px]:w-[402px]">
        <div className="mb-3 flex gap-3">
          {Array.from({ length: 3 }).map((_, index) => (
            <Skeleton key={index} className="h-8 w-24 rounded-pill" />
          ))}
        </div>
        <div className="flex flex-col gap-2">
          {Array.from({ length: 8 }).map((_, index) => (
            <VideoCardSkeleton key={index} layout="compact" />
          ))}
        </div>
      </aside>
    </div>
  );
}
