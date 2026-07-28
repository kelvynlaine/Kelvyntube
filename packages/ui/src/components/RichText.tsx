'use client';

import { parseTimestamp } from '@kelvyntube/shared';
import { Fragment, type ReactNode } from 'react';
import { cn } from '../cn';

export interface RichTextProps {
  text: string;
  /** Clic sur un horodatage type « 1:23 » — reçoit les secondes. */
  onTimestampClick?: (seconds: number) => void;
  /** Clic sur une mention « @handle » — reçoit le handle sans « @ ». */
  onMentionClick?: (handle: string) => void;
  /** Clic sur un hashtag « #tag » — reçoit le tag sans « # ». */
  onHashtagClick?: (tag: string) => void;
  /** Troncature sur N lignes (0 = aucune). */
  clamp?: 0 | 1 | 2 | 3;
  className?: string;
}

/** URL, horodatage, mention, hashtag. */
const PATTERN =
  /(https?:\/\/[^\s<]+)|((?:\d{1,2}:)?\d{1,2}:\d{2})|(@[a-zA-Z0-9._-]{3,30})|(#[\p{L}\p{N}_]{2,40})/gu;

const INLINE_ACTION =
  'rounded text-accent-fg hover:underline kt-focus-ring';

/**
 * Rend un texte brut en enrichissant liens, horodatages, mentions et hashtags.
 * Aucun HTML n'est interprété : le texte reste échappé par React.
 */
export function RichText({
  text,
  onTimestampClick,
  onMentionClick,
  onHashtagClick,
  clamp = 0,
  className,
}: RichTextProps) {
  const nodes: ReactNode[] = [];
  let lastIndex = 0;
  let key = 0;

  for (const match of text.matchAll(PATTERN)) {
    const index = match.index ?? 0;
    const [raw, url, timestamp, mention, hashtag] = match;

    if (index > lastIndex) {
      nodes.push(
        <Fragment key={`t-${key++}`}>{text.slice(lastIndex, index)}</Fragment>,
      );
    }
    lastIndex = index + raw.length;

    if (url) {
      nodes.push(
        <a
          key={`u-${key++}`}
          href={url}
          target="_blank"
          rel="noopener noreferrer nofollow"
          className={INLINE_ACTION}
        >
          {url}
        </a>,
      );
      continue;
    }

    if (timestamp) {
      const seconds = parseTimestamp(timestamp);
      if (seconds === null || !onTimestampClick) {
        nodes.push(<Fragment key={`ts-${key++}`}>{raw}</Fragment>);
      } else {
        nodes.push(
          <button
            key={`ts-${key++}`}
            type="button"
            onClick={() => onTimestampClick(seconds)}
            className={INLINE_ACTION}
          >
            {timestamp}
          </button>,
        );
      }
      continue;
    }

    if (mention) {
      const handle = mention.slice(1);
      nodes.push(
        onMentionClick ? (
          <button
            key={`m-${key++}`}
            type="button"
            onClick={() => onMentionClick(handle)}
            className={INLINE_ACTION}
          >
            {mention}
          </button>
        ) : (
          <Fragment key={`m-${key++}`}>{mention}</Fragment>
        ),
      );
      continue;
    }

    if (hashtag) {
      const tag = hashtag.slice(1);
      nodes.push(
        onHashtagClick ? (
          <button
            key={`h-${key++}`}
            type="button"
            onClick={() => onHashtagClick(tag)}
            className={INLINE_ACTION}
          >
            {hashtag}
          </button>
        ) : (
          <Fragment key={`h-${key++}`}>{hashtag}</Fragment>
        ),
      );
    }
  }

  if (lastIndex < text.length) {
    nodes.push(<Fragment key={`t-${key++}`}>{text.slice(lastIndex)}</Fragment>);
  }

  return (
    <span
      className={cn(
        'whitespace-pre-wrap break-words',
        clamp > 0 && `kt-clamp-${clamp}`,
        className,
      )}
    >
      {nodes}
    </span>
  );
}
