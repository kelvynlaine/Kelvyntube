'use client';

import { useRouter } from 'next/navigation';
import { useEffect } from 'react';
import { Spinner } from '@kelvyntube/ui';
import { useAuth } from '@/lib/auth-context';
import { PATHS } from '@/lib/nav';

/**
 * Redirige `/studio` vers `/studio/<chaîne active>`.
 * La garde d'accès (`StudioGuard`) a déjà traité les cas « non connecté » et
 * « aucune chaîne » : ici il reste seulement à choisir la destination.
 */
export function StudioRedirect() {
  const { activeChannel, loading } = useAuth();
  const router = useRouter();

  useEffect(() => {
    if (loading || !activeChannel) return;
    router.replace(PATHS.studioChannel(activeChannel.id));
  }, [activeChannel, loading, router]);

  return (
    <div className="flex min-h-[100dvh] flex-col items-center justify-center gap-3 bg-bg">
      <Spinner size={28} />
      <p className="text-kt-base text-fg-muted">Ouverture de Kelvyn Studio…</p>
    </div>
  );
}
