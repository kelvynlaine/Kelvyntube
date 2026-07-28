'use client';

import { forwardRef, useState, type CSSProperties } from 'react';
import { cn } from '../cn';

export type AvatarSize = 'xs' | 'sm' | 'md' | 'lg' | 'xl';

export interface AvatarProps {
  /** Nom affiché — sert au repli (initiales) et à la couleur déterministe. */
  name: string;
  src?: string | null;
  size?: AvatarSize;
  /**
   * Texte alternatif. Vide par défaut : l'avatar est décoratif car il est
   * systématiquement accompagné d'un nom visible ou d'un lien libellé.
   * Renseigner uniquement pour un avatar utilisé seul.
   */
  alt?: string;
  /** Anneau de contour (chaîne active, story…). */
  ring?: boolean;
  className?: string;
  style?: CSSProperties;
}

/** Diamètres en pixels par taille. */
export const AVATAR_PX: Record<AvatarSize, number> = {
  xs: 24,
  sm: 32,
  md: 40,
  lg: 80,
  xl: 160,
};

const SIZE_CLASS: Record<AvatarSize, string> = {
  xs: 'size-6 text-[10px]',
  sm: 'size-8 text-kt-sm',
  md: 'size-10 text-kt-base',
  lg: 'size-20 text-kt-xl',
  xl: 'size-40 text-[56px]',
};

/** Initiales : première lettre des deux premiers mots. */
export function getInitials(name: string): string {
  const words = name.trim().split(/\s+/).filter(Boolean);
  if (words.length === 0) return '?';
  if (words.length === 1) return words[0].slice(0, 2).toUpperCase();
  return (words[0][0] + words[1][0]).toUpperCase();
}

/** Hash stable (djb2) — même nom = même couleur, serveur comme client. */
function hashString(value: string): number {
  let hash = 5381;
  for (let i = 0; i < value.length; i += 1) {
    hash = ((hash << 5) + hash + value.charCodeAt(i)) | 0;
  }
  return Math.abs(hash);
}

/**
 * Couleur de fond déterministe dérivée du nom.
 * Luminosité fixe et basse pour garantir le contraste avec le texte blanc,
 * quel que soit le thème.
 */
export function getAvatarColor(name: string): string {
  const hue = hashString(name || '?') % 360;
  return `hsl(${hue} 42% 38%)`;
}

/** Avatar rond avec repli sur les initiales. */
export const Avatar = forwardRef<HTMLSpanElement, AvatarProps>(function Avatar(
  { name, src, size = 'md', alt = '', ring = false, className, style },
  ref,
) {
  const [failed, setFailed] = useState(false);
  const showImage = Boolean(src) && !failed;

  return (
    <span
      ref={ref}
      className={cn(
        'relative inline-flex shrink-0 select-none items-center justify-center overflow-hidden rounded-full',
        'bg-bg-elevated font-medium leading-none text-white',
        ring && 'ring-2 ring-border-strong ring-offset-2 ring-offset-bg',
        SIZE_CLASS[size],
        className,
      )}
      style={showImage ? style : { backgroundColor: getAvatarColor(name), ...style }}
    >
      {showImage ? (
        <img
          src={src as string}
          alt={alt}
          width={AVATAR_PX[size]}
          height={AVATAR_PX[size]}
          loading="lazy"
          decoding="async"
          className="size-full object-cover"
          onError={() => setFailed(true)}
        />
      ) : (
        <span aria-hidden="true">{getInitials(name)}</span>
      )}
      {/* Nom exposé uniquement si l'avatar porte lui-même l'information */}
      {!showImage && alt ? <span className="sr-only">{alt}</span> : null}
    </span>
  );
});
