'use client';

import type { LikeState } from '@kelvyntube/shared';
import { formatCompactNumber } from '@kelvyntube/shared';
import { ThumbsDown, ThumbsUp } from 'lucide-react';
import { useEffect, useRef, useState } from 'react';
import { cn } from '../cn';

export interface LikeBarProps {
  likeCount: number;
  /** `null` quand l'API masque le compteur (non-propriétaire). */
  dislikeCount?: number | null;
  state: LikeState;
  onLike: () => void;
  onDislike: () => void;
  disabled?: boolean;
  size?: 'sm' | 'md';
  /** Masque le nombre de likes. */
  hideCount?: boolean;
  className?: string;
}

/** Groupe like / dislike en pilule, séparé par un trait vertical. */
export function LikeBar({
  likeCount,
  dislikeCount,
  state,
  onLike,
  onDislike,
  disabled = false,
  size = 'md',
  hideCount = false,
  className,
}: LikeBarProps) {
  const [popping, setPopping] = useState(false);
  const previousState = useRef<LikeState>(state);

  // Animation « pop » au passage à l'état liké
  useEffect(() => {
    const wasLiked = previousState.current === 'LIKE';
    previousState.current = state;
    if (state !== 'LIKE' || wasLiked) return;
    setPopping(true);
    const timer = setTimeout(() => setPopping(false), 320);
    return () => clearTimeout(timer);
  }, [state]);

  const liked = state === 'LIKE';
  const disliked = state === 'DISLIKE';
  const iconSize = size === 'sm' ? 18 : 22;

  const buttonClass = cn(
    'inline-flex items-center gap-2 transition-colors kt-focus-ring',
    'text-kt-base font-medium text-fg hover:bg-bg-hover disabled:opacity-50',
    size === 'sm' ? 'h-8 px-3' : 'h-9 px-4',
  );

  return (
    <div
      className={cn(
        'inline-flex items-stretch overflow-hidden rounded-pill bg-bg-elevated',
        className,
      )}
    >
      <button
        type="button"
        disabled={disabled}
        aria-pressed={liked}
        aria-label={liked ? 'Retirer le like' : "J'aime"}
        onClick={onLike}
        className={cn(buttonClass, 'rounded-l-pill')}
      >
        <ThumbsUp
          size={iconSize}
          aria-hidden="true"
          fill={liked ? 'currentColor' : 'none'}
          className={cn(popping && 'animate-pop-heart')}
        />
        {!hideCount && (
          <span className="tabular-nums">{formatCompactNumber(likeCount)}</span>
        )}
      </button>

      <span aria-hidden="true" className="my-2 w-px shrink-0 bg-border" />

      <button
        type="button"
        disabled={disabled}
        aria-pressed={disliked}
        aria-label={disliked ? 'Retirer le dislike' : "Je n'aime pas"}
        onClick={onDislike}
        className={cn(buttonClass, 'rounded-r-pill')}
      >
        <ThumbsDown
          size={iconSize}
          aria-hidden="true"
          fill={disliked ? 'currentColor' : 'none'}
        />
        {typeof dislikeCount === 'number' && !hideCount ? (
          <span className="tabular-nums">{formatCompactNumber(dislikeCount)}</span>
        ) : null}
      </button>
    </div>
  );
}
