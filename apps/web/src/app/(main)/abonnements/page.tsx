import type { Metadata } from 'next';
import { Suspense } from 'react';
import { LibrarySkeleton } from '@/components/library/LibraryShell';
import { SubscriptionsView } from '@/components/library/SubscriptionsView';

export const metadata: Metadata = {
  title: 'Abonnements',
  description: 'Les dernières vidéos des chaînes auxquelles vous êtes abonné.',
};

/** Feed des abonnements + gestion des chaînes suivies. */
export default function AbonnementsPage() {
  return (
    <Suspense fallback={<LibrarySkeleton />}>
      <SubscriptionsView />
    </Suspense>
  );
}
