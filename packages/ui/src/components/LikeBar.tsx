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
    'inline-flex shrink-0 items-center gap-1.5 whitespace-nowrap transition-colors kt-focus-ring xs:gap-2',
    'text-kt-base font-medium text-fg hover:bg-bg-hover disabled:opacity-50',
    // Rembourrage réduit sous 480 px : sur un iPhone la rangée d'actions
    // (LikeBar / Partager / Enregistrer / ⋯) tient alors sans défilement,
    // et le compteur reste lisible plutôt que d'être rogné.
    size === 'sm' ? 'h-8 px-2.5 xs:px-3' : 'h-9 px-3 xs:px-4 kt-tap-y',
  );

  return (
    <div
      className={cn(
        // `shrink-0` est le correctif central : placée en tête d'une rangée
        // `flex`, la barre était comprimée jusqu'à 33 px de large, ce qui
        // masquait le compteur ET le bouton « je n'aime pas ». Elle refuse
        // désormais toute compression ; c'est à la rangée parente de passer à
        // la ligne ou de défiler.
        'inline-flex w-fit shrink-0 items-stretch overflow-hidden rounded-pill bg-bg-elevated',
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
