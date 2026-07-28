'use client';

import { useRouter } from 'next/navigation';
import { useEffect, useState } from 'react';
import { KelvynLogo, Modal } from '@kelvyntube/ui';
import { PATHS } from '@/lib/nav';
import { useAuth } from '@/lib/auth-context';
import { LoginForm } from './LoginForm';
import { RegisterForm } from './RegisterForm';

/**
 * ═══════════════════════════════════════════════════════════════════════════
 *  MODALE DE CONNEXION RAPIDE
 *  Contrat imposé par le layout principal :
 *   - export **par défaut** ;
 *   - composant **client** ;
 *   - **aucune prop** : l'ouverture/fermeture vient de `useAuth()`
 *     (`authModalOpen` / `setAuthModalOpen`).
 *  Déclenchée par `requireAuth()` (like, commentaire, abonnement en anonyme).
 * ═══════════════════════════════════════════════════════════════════════════
 */

type Mode = 'login' | 'register';

/** URL courante encodée pour le paramètre `?next=` (lue hors rendu). */
function currentNextParam(): string {
  if (typeof window === 'undefined') return '';
  return encodeURIComponent(`${window.location.pathname}${window.location.search}`);
}

export default function AuthModal() {
  const { authModalOpen, setAuthModalOpen } = useAuth();
  const router = useRouter();
  const [mode, setMode] = useState<Mode>('login');

  // Chaque ouverture repart de l'onglet Connexion.
  useEffect(() => {
    if (authModalOpen) setMode('login');
  }, [authModalOpen]);

  const close = () => setAuthModalOpen(false);

  /** Lien « page complète » : conserve la page courante dans `?next=`. */
  const goToFullPage = () => {
    const base = mode === 'login' ? PATHS.login : PATHS.register;
    const next = currentNextParam();
    close();
    router.push(next ? `${base}?next=${next}` : base);
  };

  return (
    <Modal
      open={authModalOpen}
      onClose={close}
      size="sm"
      ariaLabel={mode === 'login' ? 'Se connecter' : 'Créer un compte'}
      hideCloseButton={false}
    >
      <div className="flex flex-col gap-5">
        <div className="flex flex-col items-center gap-2 text-center">
          <KelvynLogo size={26} />
          <h2 className="text-kt-lg font-medium text-fg">
            {mode === 'login' ? 'Connecte-toi pour continuer' : 'Crée ton compte'}
          </h2>
          <p className="text-kt-base text-fg-muted">
            {mode === 'login'
              ? 'Un compte est nécessaire pour aimer, commenter et t’abonner.'
              : 'Quelques secondes suffisent pour rejoindre Kelvyn Tube.'}
          </p>
        </div>

        {mode === 'login' ? (
          <LoginForm
            onSuccess={close}
            onSwitchToRegister={() => setMode('register')}
          />
        ) : (
          <RegisterForm
            onSwitchToLogin={() => setMode('login')}
            onSuccess={() => {
              // Nouveau compte : la chaîne reste à créer via l'onboarding.
              const next = currentNextParam();
              close();
              router.push(next ? `${PATHS.onboarding}?next=${next}` : PATHS.onboarding);
            }}
          />
        )}

        <button
          type="button"
          onClick={goToFullPage}
          className="self-center rounded text-kt-sm text-fg-muted underline-offset-2 transition-colors hover:text-fg hover:underline kt-focus-ring"
        >
          Continuer sur la page complète
        </button>
      </div>
    </Modal>
  );
}
