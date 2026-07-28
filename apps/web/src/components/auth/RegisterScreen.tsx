'use client';

import { useRouter, useSearchParams } from 'next/navigation';
import { PATHS } from '@/lib/nav';
import { RegisterForm } from './RegisterForm';
import { safeNextPath } from './form-utils';

/** Écran `/inscription` : après succès, l'utilisateur passe par l'onboarding. */
export function RegisterScreen() {
  const router = useRouter();
  const searchParams = useSearchParams();
  const next = safeNextPath(searchParams.get('next'), '');

  return (
    <div className="flex flex-col gap-6">
      <header className="flex flex-col gap-1">
        <h1 className="text-kt-lg font-medium text-fg">Créer un compte</h1>
        <p className="text-kt-base text-fg-muted">
          Ta chaîne se configure juste après, en trois étapes.
        </p>
      </header>

      <RegisterForm
        onSuccess={() =>
          router.replace(
            next ? `${PATHS.onboarding}?next=${encodeURIComponent(next)}` : PATHS.onboarding,
          )
        }
      />
    </div>
  );
}
