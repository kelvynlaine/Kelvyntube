import type { Metadata } from 'next';
import { Suspense } from 'react';
import { Spinner } from '@kelvyntube/ui';
import { RegisterScreen } from '@/components/auth/RegisterScreen';

export const metadata: Metadata = {
  title: 'Créer un compte',
  description: 'Rejoins Kelvyn Tube et crée ta chaîne en quelques secondes.',
  robots: { index: false },
};

export default function RegisterPage() {
  return (
    <Suspense fallback={<Spinner size={24} className="mx-auto" />}>
      <RegisterScreen />
    </Suspense>
  );
}
