import { Suspense, type ReactNode } from 'react';
import type { Metadata } from 'next';
import { StudioChrome } from '@/components/studio/StudioChrome';
import { StudioShellSkeleton } from '@/components/studio/StudioGuard';

/**
 * Layout de Kelvyn Studio.
 * Volontairement HORS du groupe `(main)` : le Studio a sa propre chrome
 * (sidebar dédiée, en-tête avec le bouton CRÉER) et ses propres gardes.
 */
export const metadata: Metadata = {
  title: {
    default: 'Kelvyn Studio',
    template: '%s — Kelvyn Studio',
  },
  description: 'Gérez vos vidéos, vos statistiques et votre communauté.',
  robots: { index: false, follow: false },
};

export default function StudioLayout({ children }: { children: ReactNode }) {
  return (
    <Suspense fallback={<StudioShellSkeleton />}>
      <StudioChrome>{children}</StudioChrome>
    </Suspense>
  );
}
