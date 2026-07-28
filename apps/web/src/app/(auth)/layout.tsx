import Link from 'next/link';
import type { ReactNode } from 'react';
import { ArrowLeft } from 'lucide-react';
import { KelvynLogo } from '@kelvyntube/ui';
import { PATHS } from '@/lib/nav';

/**
 * ═══════════════════════════════════════════════════════════════════════════
 *  MISE EN PAGE DES ÉCRANS D'AUTHENTIFICATION
 *  Hors du layout `(main)` : pas de sidebar ni de barre supérieure, juste une
 *  carte centrée. Les fournisseurs globaux (React Query, Auth, Toast) viennent
 *  du layout racine.
 * ═══════════════════════════════════════════════════════════════════════════
 */
export default function AuthLayout({ children }: { children: ReactNode }) {
  return (
    <div className="flex min-h-[100dvh] flex-col items-center justify-center gap-6 bg-bg px-4 py-10">
      <Link
        href={PATHS.home}
        aria-label="Kelvyn Tube — retour à l’accueil"
        className="rounded kt-focus-ring"
      >
        <KelvynLogo size={30} />
      </Link>

      <main className="w-full max-w-[420px] rounded-kt-lg border border-border bg-bg-elevated p-6 feed-2:p-8">
        {children}
      </main>

      <Link
        href={PATHS.home}
        className="flex items-center gap-1.5 rounded text-kt-base text-fg-muted transition-colors hover:text-fg kt-focus-ring"
      >
        <ArrowLeft size={16} aria-hidden="true" />
        Retour à l’accueil
      </Link>
    </div>
  );
}
