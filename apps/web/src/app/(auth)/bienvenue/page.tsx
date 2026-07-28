import type { Metadata } from 'next';
import { Suspense } from 'react';
import { Spinner } from '@kelvyntube/ui';
import { OnboardingWizard } from '@/components/auth/OnboardingWizard';

export const metadata: Metadata = {
  title: 'Bienvenue',
  description: 'Configure ta chaîne Kelvyn Tube en trois étapes.',
  robots: { index: false },
};

export default function OnboardingPage() {
  return (
    <Suspense fallback={<Spinner size={24} className="mx-auto" />}>
      <OnboardingWizard />
    </Suspense>
  );
}
