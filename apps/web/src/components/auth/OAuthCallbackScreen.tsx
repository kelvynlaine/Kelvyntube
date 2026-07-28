'use client';

import Link from 'next/link';
import { useRouter } from 'next/navigation';
import { useEffect, useRef, useState } from 'react';
import { XCircle } from 'lucide-react';
import { KelvynLogo, Spinner } from '@kelvyntube/ui';
import { setAccessToken } from '@/lib/api';
import { PATHS } from '@/lib/nav';
import { useAuth } from '@/lib/auth-context';

/**
 * ═══════════════════════════════════════════════════════════════════════════
 *  RETOUR OAUTH GOOGLE — `/auth/callback`
 *  L'API redirige avec le jeton dans le **fragment** (`#token=…`), jamais dans
 *  la query string. On l'adopte, on recharge l'utilisateur, puis on nettoie
 *  l'URL avant de rediriger.
 * ═══════════════════════════════════════════════════════════════════════════
 */

/** Messages lisibles pour les codes d'erreur renvoyés par l'API. */
const ERROR_MESSAGES: Record<string, string> = {
  access_denied: 'Tu as refusé l’autorisation Google.',
  invalid_request: 'La requête d’authentification était incomplète.',
  state_mismatch: 'La session d’authentification a expiré. Réessaie.',
};

export function OAuthCallbackScreen() {
  const router = useRouter();
  const { user, refreshUser } = useAuth();
  const [error, setError] = useState<string | null>(null);
  const [ready, setReady] = useState(false);
  const handled = useRef(false);

  useEffect(() => {
    if (handled.current) return;
    handled.current = true;

    const fragment = new URLSearchParams(window.location.hash.replace(/^#/, ''));
    const token = fragment.get('token');
    const failure = fragment.get('error');

    // Le jeton ne doit pas rester dans l'historique du navigateur.
    window.history.replaceState(null, '', window.location.pathname);

    if (failure) {
      setError(ERROR_MESSAGES[failure] ?? failure);
      return;
    }
    if (!token) {
      setError('Aucun jeton d’authentification reçu.');
      return;
    }

    setAccessToken(token);
    void refreshUser().finally(() => setReady(true));
  }, [refreshUser]);

  // Redirection une fois l'utilisateur chargé.
  useEffect(() => {
    if (!ready) return;
    if (!user) {
      setError('Impossible de récupérer ton profil. Réessaie de te connecter.');
      return;
    }
    router.replace(user.onboarded ? PATHS.home : PATHS.onboarding);
  }, [ready, user, router]);

  return (
    <main className="flex min-h-screen flex-col items-center justify-center gap-6 bg-bg px-4 text-center">
      <KelvynLogo size={30} />

      {error ? (
        <div className="flex max-w-[420px] flex-col items-center gap-4">
          <XCircle size={40} aria-hidden="true" className="text-danger" />
          <h1 className="text-kt-lg font-medium text-fg">Connexion Google échouée</h1>
          <p role="alert" className="text-kt-base text-fg-muted">
            {error}
          </p>
          <div className="flex flex-wrap items-center justify-center gap-2">
            <Link href={PATHS.login} className="kt-btn-primary h-11 px-6">
              Revenir à la connexion
            </Link>
            <Link href={PATHS.home} className="kt-btn-secondary h-11 px-6">
              Accueil
            </Link>
          </div>
        </div>
      ) : (
        <div className="flex flex-col items-center gap-3">
          <Spinner size={28} />
          <p role="status" aria-live="polite" className="text-kt-base text-fg-muted">
            Connexion en cours…
          </p>
        </div>
      )}
    </main>
  );
}
