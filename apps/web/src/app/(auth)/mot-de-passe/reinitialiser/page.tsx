import type { Metadata } from 'next';
import { Suspense } from 'react';
import { Spinner } from '@kelvyntube/ui';
import { ResetPasswordScreen } from '@/components/auth/ResetPasswordScreen';

export const metadata: Metadata = {
  title: 'Réinitialiser le mot de passe',
  robots: { index: false },
};

export default function ResetPasswordPage() {
  return (
    <Suspense fallback={<Spinner size={24} className="mx-auto" />}>
      <ResetPasswordScreen />
    </Suspense>
  );
}
