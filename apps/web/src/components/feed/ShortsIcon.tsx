/**
 * Glyphe « Shorts » : rectangle vertical arrondi évidé d'un triangle de
 * lecture. Dessiné à la main (aucune icône `lucide-react` n'y correspond).
 */
export interface ShortsIconProps {
  size?: number;
  className?: string;
}

export function ShortsIcon({ size = 22, className }: ShortsIconProps) {
  return (
    <svg
      width={size}
      height={size}
      viewBox="0 0 24 24"
      fill="currentColor"
      aria-hidden="true"
      focusable="false"
      className={className}
    >
      <path
        fillRule="evenodd"
        clipRule="evenodd"
        d="M11 2h2a6 6 0 0 1 6 6v8a6 6 0 0 1-6 6h-2a6 6 0 0 1-6-6V8a6 6 0 0 1 6-6Zm-0.5 6.5v7l6-3.5-6-3.5Z"
      />
    </svg>
  );
}
