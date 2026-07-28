import { cn } from '../cn';

export interface KelvynLogoProps {
  /** Hauteur du symbole en pixels. */
  size?: number;
  /** Affiche le mot-symbole « KelvynTube » à droite du triangle. */
  withWordmark?: boolean;
  className?: string;
  /** Texte accessible (mettre `''` si le logo est purement décoratif). */
  title?: string;
}

/**
 * Logo maison : triangle « play » rouge + mot-symbole.
 * Aucun emprunt à l'identité visuelle de YouTube.
 */
export function KelvynLogo({
  size = 22,
  withWordmark = true,
  className,
  title = 'Kelvyn Tube',
}: KelvynLogoProps) {
  return (
    <span className={cn('inline-flex items-center gap-1.5', className)}>
      <svg
        width={size}
        height={size}
        viewBox="0 0 24 24"
        className="shrink-0 text-brand"
        role={title ? 'img' : 'presentation'}
        aria-label={title || undefined}
        aria-hidden={title ? undefined : true}
      >
        <path
          d="M7.5 4.8 20 12 7.5 19.2Z"
          fill="currentColor"
          stroke="currentColor"
          strokeWidth="3.2"
          strokeLinejoin="round"
        />
      </svg>
      {withWordmark ? (
        <span className="text-kt-lg font-semibold leading-none tracking-tighter text-fg">
          Kelvyn
          <span className="font-light text-fg-muted">Tube</span>
        </span>
      ) : null}
    </span>
  );
}
