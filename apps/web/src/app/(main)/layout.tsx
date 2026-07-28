import { Suspense, type ReactNode } from 'react';
import { AppShell } from '@/components/layout/AppShell';

/**
 * Layout principal : toutes les pages de navigation classique
 * (accueil, chaîne, bibliothèque, résultats…) sont rendues à l'intérieur
 * du shell (barre supérieure + sidebar + navigation mobile).
 *
 * Les surfaces immersives — /watch, /shorts, /studio, /(auth) — vivent
 * volontairement en dehors de ce groupe et gèrent leur propre mise en page.
 */
export default function MainLayout({ children }: { children: ReactNode }) {
  return (
    <Suspense fallback={<div className="min-h-[100dvh] bg-bg" />}>
      <AppShell>{children}</AppShell>
    </Suspense>
  );
}
