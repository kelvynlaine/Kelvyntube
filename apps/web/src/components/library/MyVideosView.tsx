'use client';

import Link from 'next/link';
import { useRouter } from 'next/navigation';
import { Video } from 'lucide-react';
import { useEffect } from 'react';
import { EmptyState, Spinner } from '@kelvyntube/ui';
import { useAuth } from '@/lib/auth-context';
import { PATHS } from '@/lib/nav';
import { LibraryAuthGate, LibraryPage } from './LibraryShell';

/**
 * ═══════════════════════════════════════════════════════════════════════════
 *  PAGE « MES VIDÉOS »
 *  Redirige vers le Studio de la chaîne active ; sans chaîne, invite à en
 *  créer une.
 * ═══════════════════════════════════════════════════════════════════════════
 */
export function MyVideosView() {
  return (
    <LibraryAuthGate
      icon={<Video size={28} aria-hidden="true" />}
      title="Gérez vos vidéos"
      description="Connectez-vous pour accéder aux vidéos de votre chaîne."
      skeleton="list"
    >
      <MyVideosContent />
    </LibraryAuthGate>
  );
}

function MyVideosContent() {
  const { activeChannel } = useAuth();
  const router = useRouter();

  useEffect(() => {
    if (activeChannel) router.replace(PATHS.studioVideos(activeChannel.id));
  }, [activeChannel, router]);

  if (activeChannel) {
    return (
      <LibraryPage>
        <div
          role="status"
          className="flex items-center justify-center gap-3 py-24 text-fg-muted"
        >
          <Spinner size={20} />
          Redirection vers Kelvyn Studio…
        </div>
      </LibraryPage>
    );
  }

  return (
    <LibraryPage>
      <EmptyState
        icon={<Video size={28} aria-hidden="true" />}
        title="Vous n'avez pas encore de chaîne"
        description="Créez une chaîne pour mettre en ligne vos vidéos et suivre leurs performances."
        action={
          <Link href={PATHS.studio} className="kt-btn-primary h-9 px-4">
            Créer une chaîne
          </Link>
        }
      />
    </LibraryPage>
  );
}
