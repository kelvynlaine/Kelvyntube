'use client';

import Link from 'next/link';
import type { SubscriptionDTO } from '@kelvyntube/shared';
import { Avatar, Badge, Skeleton } from '@kelvyntube/ui';
import { PATHS } from '@/lib/nav';

/**
 * Bandeau horizontal des chaînes suivies : avatars, pastille de nouveautés
 * (`unseenCount`) et défilement horizontal.
 */
export function SubscriptionRail({
  subscriptions,
  loading,
}: {
  subscriptions: SubscriptionDTO[];
  loading: boolean;
}) {
  if (loading) {
    return (
      <div className="kt-no-scrollbar flex gap-4 overflow-x-auto pb-2" aria-hidden="true">
        {Array.from({ length: 8 }, (_, index) => (
          <div key={index} className="flex w-20 shrink-0 flex-col items-center gap-2">
            <Skeleton variant="circle" className="size-14" />
            <Skeleton variant="text" className="h-3 w-14" />
          </div>
        ))}
      </div>
    );
  }

  if (subscriptions.length === 0) return null;

  return (
    <nav aria-label="Chaînes auxquelles vous êtes abonné">
      <ul className="kt-no-scrollbar flex gap-2 overflow-x-auto pb-2">
        {subscriptions.map((sub) => (
          <li key={sub.channel.id} className="shrink-0">
            <Link
              href={PATHS.channel(sub.channel.handle)}
              aria-label={
                sub.unseenCount > 0
                  ? `${sub.channel.name}, ${sub.unseenCount} nouvelle${sub.unseenCount > 1 ? 's' : ''} vidéo${sub.unseenCount > 1 ? 's' : ''}`
                  : sub.channel.name
              }
              className="flex w-24 flex-col items-center gap-1 rounded-kt p-2 transition-colors hover:bg-bg-hover kt-focus-ring"
            >
              <span className="relative">
                <Avatar
                  name={sub.channel.name}
                  src={sub.channel.avatarUrl}
                  size="md"
                  className="size-14"
                />
                {sub.unseenCount > 0 ? (
                  <Badge
                    variant="brand"
                    aria-hidden="true"
                    className="absolute -right-1 -top-1 tabular-nums"
                  >
                    {sub.unseenCount > 99 ? '99+' : sub.unseenCount}
                  </Badge>
                ) : null}
              </span>
              <span className="w-full truncate text-center text-kt-sm text-fg">
                {sub.channel.name}
              </span>
            </Link>
          </li>
        ))}
      </ul>
    </nav>
  );
}
