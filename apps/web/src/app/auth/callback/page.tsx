import type { Metadata } from 'next';
import { OAuthCallbackScreen } from '@/components/auth/OAuthCallbackScreen';

export const metadata: Metadata = {
  title: 'Connexion Google',
  robots: { index: false },
};

/**
 * Retour OAuth Google. Hors du layout `(auth)` : l'API redirige ici avec le
 * jeton dans le fragment, l'écran gère lui-même sa mise en page plein écran.
 */
export default function OAuthCallbackPage() {
  return <OAuthCallbackScreen />;
}
