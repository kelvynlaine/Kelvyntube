'use client';

import { ThumbsUp } from 'lucide-react';
import { formatCompactNumber, formatRelativeTime } from '@kelvyntube/shared';
import { ChannelAvatar, RichText, Skeleton } from '@kelvyntube/ui';
import Link from 'next/link';
import type { ChannelPostDTO } from './queries';

/** Publication communautaire : auteur, texte enrichi, image et likes. */
export function CommunityPostCard({ post }: { post: ChannelPostDTO }) {
  return (
    <article className="flex flex-col gap-3 border-b border-border pb-6 last:border-0">
      <div className="flex items-center gap-3">
        <ChannelAvatar
          channel={post.channel}
          size="sm"
          showName
          linkComponent={Link}
          nameClassName="text-kt-base"
        />
        <span aria-hidden="true" className="text-fg-subtle">
          •
        </span>
        <time dateTime={post.createdAt} className="text-kt-sm text-fg-muted">
          {formatRelativeTime(post.createdAt)}
        </time>
      </div>

      <RichText text={post.text} className="max-w-prose text-kt-base text-fg" />

      {post.imageUrl ? (
        <img
          src={post.imageUrl}
          alt=""
          loading="lazy"
          decoding="async"
          className="max-h-[520px] w-full max-w-2xl rounded-kt object-cover"
        />
      ) : null}

      <p className="flex items-center gap-2 text-kt-sm text-fg-muted">
        <ThumbsUp size={16} aria-hidden="true" />
        <span>
          {formatCompactNumber(post.likeCount)}
          <span className="sr-only"> j’aime</span>
        </span>
      </p>
    </article>
  );
}

export function CommunityPostSkeleton() {
  return (
    <div className="flex flex-col gap-3 border-b border-border pb-6" aria-hidden="true">
      <div className="flex items-center gap-3">
        <Skeleton variant="circle" className="size-8" />
        <Skeleton variant="text" className="h-4 w-32" />
      </div>
      <Skeleton variant="text" className="h-4 w-full max-w-prose" />
      <Skeleton variant="text" className="h-4 w-2/3" />
    </div>
  );
}
