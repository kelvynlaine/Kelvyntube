'use client';

import type { ReactNode } from 'react';
import Link from 'next/link';
import { useRouter } from 'next/navigation';
import { ToastProvider, TopBar } from '@kelvyntube/ui';
import { useAuth } from '@/lib/auth-context';
import { PATHS } from '@/lib/nav';

/**
 * Enveloppe de la page de visionnage : `/watch` vit hors du layout principal
 * (pas de barre latérale fixe), donc on fournit ici la barre supérieure et le
 * contexte de notifications.
 */
export function WatchShell({ children }: { children: ReactNode }) {
  const router = useRouter();
  const { user, setAuthModalOpen } = useAuth();

  return (
    <ToastProvider>
      {/* `100dvh` : `100vh` fige la hauteur barre d'URL déployée sur iOS. */}
      <div className="min-h-[100dvh] bg-bg">
        <a
          href="#contenu-visionnage"
          className="sr-only focus:not-sr-only focus:absolute focus:left-4 focus:top-4 focus:z-50 focus:rounded-kt focus:bg-bg-elevated focus:px-4 focus:py-2 focus:text-fg"
        >
          Aller au contenu
        </a>

        {/* Non collante sur mobile : le lecteur y prend la place du haut. */}
        <TopBar
          linkComponent={Link}
          homeHref={PATHS.home}
          user={
            user ? { displayName: user.displayName, avatarUrl: user.avatarUrl } : null
          }
          onSignIn={user ? undefined : () => setAuthModalOpen(true)}
          onAvatarClick={() => router.push(PATHS.settings)}
          onSearchSubmit={(value) => router.push(PATHS.results(value))}
          className="static min-[1015px]:sticky"
        />

        <main id="contenu-visionnage">{children}</main>
      </div>
    </ToastProvider>
  );
}
