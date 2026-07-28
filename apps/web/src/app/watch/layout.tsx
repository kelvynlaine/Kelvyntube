import type { ReactNode } from 'react';
import { WatchShell } from '@/components/watch';

/**
 * `/watch` est volontairement hors du layout `(main)` : pas de barre latérale
 * fixe, la page gère sa propre mise en page autour du lecteur.
 */
export default function WatchRouteLayout({ children }: { children: ReactNode }) {
  return <WatchShell>{children}</WatchShell>;
}
