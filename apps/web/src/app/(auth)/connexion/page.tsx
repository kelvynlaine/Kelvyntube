import type { Metadata } from 'next';
import { Suspense } from 'react';
import { Spinner } from '@kelvyntube/ui';
import { LoginScreen } from '@/components/auth/LoginScreen';

export const metadata: Metadata = {
  title: 'Se connecter',
  description: 'Connecte-toi à Kelvyn Tube pour retrouver tes abonnements.',
  robots: { index: false },
};

/** `useSearchParams` impose une frontière Suspense au prérendu. */
export default function LoginPage() {
  return (
    <Suspense fallback={<Spinner size={24} className="mx-auto" />}>
      <LoginScreen />
    </Suspense>
  );
}
