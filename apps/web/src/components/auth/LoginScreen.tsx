'use client';

import { useRouter, useSearchParams } from 'next/navigation';
import { useEffect } from 'react';
import { PATHS } from '@/lib/nav';
import { useAuth } from '@/lib/auth-context';
import { LoginForm } from './LoginForm';
import { safeNextPath } from './form-utils';

/** Écran `/connexion` : formulaire complet + redirection `?next=`. */
export function LoginScreen() {
  const router = useRouter();
  const searchParams = useSearchParams();
  const { user, loading } = useAuth();
  const next = safeNextPath(searchParams.get('next'), PATHS.home);

  // Session déjà ouverte : on ne montre pas le formulaire.
  useEffect(() => {
    if (!loading && user) router.replace(next);
  }, [loading, user, next, router]);

  return (
    <div className="flex flex-col gap-6">
      <header className="flex flex-col gap-1">
        <h1 className="text-kt-lg font-medium text-fg">Se connecter</h1>
        <p className="text-kt-base text-fg-muted">
          Retrouve tes abonnements, ton historique et tes playlists.
        </p>
      </header>

      <LoginForm onSuccess={() => router.replace(next)} />
    </div>
  );
}
