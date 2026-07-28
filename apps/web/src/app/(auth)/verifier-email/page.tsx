import type { Metadata } from 'next';
import { Suspense } from 'react';
import { Spinner } from '@kelvyntube/ui';
import { VerifyEmailScreen } from '@/components/auth/VerifyEmailScreen';

export const metadata: Metadata = {
  title: 'Vérification de l’email',
  robots: { index: false },
};

export default function VerifyEmailPage() {
  return (
    <Suspense fallback={<Spinner size={24} className="mx-auto" />}>
      <VerifyEmailScreen />
    </Suspense>
  );
}
