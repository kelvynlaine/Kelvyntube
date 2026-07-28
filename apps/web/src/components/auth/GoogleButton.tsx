'use client';

import { ROUTES } from '@kelvyntube/shared';
import { Button } from '@kelvyntube/ui';
import { API_BASE } from '@/lib/api';

/**
 * ═══════════════════════════════════════════════════════════════════════════
 *  BOUTON « CONTINUER AVEC GOOGLE »
 *
 *  Décision : l'affichage est piloté par `NEXT_PUBLIC_GOOGLE_ENABLED`.
 *  Une sonde au montage aurait dû appeler `GET /auth/oauth/google`, or cette
 *  route répond soit 501 (non configurée) soit une **redirection 302 vers
 *  Google** — la sonde suivrait donc la redirection cross-origin à chaque
 *  affichage du formulaire. Le drapeau d'environnement donne le même résultat
 *  sans requête parasite ; l'API reste la garde-fou (501 explicite) si le
 *  drapeau est mal réglé.
 * ═══════════════════════════════════════════════════════════════════════════
 */
export function isGoogleEnabled(): boolean {
  return process.env.NEXT_PUBLIC_GOOGLE_ENABLED === 'true';
}

/** Icône Google monochrome (aucune reprise du logo officiel en couleurs). */
function GoogleGlyph() {
  return (
    <svg width={18} height={18} viewBox="0 0 24 24" aria-hidden="true" fill="currentColor">
      <path d="M12 11v2.8h6.6c-.3 1.7-2 5-6.6 5a7 7 0 1 1 0-14c2 0 3.4.9 4.2 1.6l2.4-2.3A9.6 9.6 0 0 0 12 2a10 10 0 1 0 0 20c5.8 0 9.6-4 9.6-9.7 0-.7-.1-1.1-.2-1.6H12Z" />
    </svg>
  );
}

export interface GoogleButtonProps {
  /** Libellé du bouton (« Se connecter » / « S'inscrire »). */
  label?: string;
}

/** Démarre le flow OAuth côté API (redirection navigateur, pas de fetch). */
export function GoogleButton({ label = 'Continuer avec Google' }: GoogleButtonProps) {
  if (!isGoogleEnabled()) return null;

  return (
    <Button
      variant="outline"
      fullWidth
      iconLeft={<GoogleGlyph />}
      onClick={() => {
        window.location.href = `${API_BASE}${ROUTES.auth.googleStart}`;
      }}
    >
      {label}
    </Button>
  );
}

/** Séparateur « ou » entre le formulaire et les fournisseurs externes. */
export function AuthDivider() {
  return (
    <div className="flex items-center gap-3" aria-hidden="true">
      <span className="h-px flex-1 bg-border" />
      <span className="text-kt-sm text-fg-subtle">ou</span>
      <span className="h-px flex-1 bg-border" />
    </div>
  );
}
