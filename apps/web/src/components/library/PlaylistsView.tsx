'use client';

import { ListVideo, Plus } from 'lucide-react';
import { useState } from 'react';
import { Button, EmptyState, Skeleton } from '@kelvyntube/ui';
import { PATHS } from '@/lib/nav';
import { LibraryAuthGate, LibraryHeader, LibraryPage } from './LibraryShell';
import { CreatePlaylistModal } from './CreatePlaylistModal';
import { PlaylistCard } from './PlaylistCard';
import { usePlaylists } from './queries';

/**
 * ═══════════════════════════════════════════════════════════════════════════
 *  PAGE « PLAYLISTS » — grille de toutes les playlists de l'utilisateur.
 * ═══════════════════════════════════════════════════════════════════════════
 */
export function PlaylistsView() {
  return (
    <LibraryAuthGate
      icon={<ListVideo size={28} aria-hidden="true" />}
      title="Organisez vos vidéos en playlists"
      description="Connectez-vous pour créer et retrouver vos playlists."
    >
      <PlaylistsContent />
    </LibraryAuthGate>
  );
}

function PlaylistsContent() {
  const [modalOpen, setModalOpen] = useState(false);
  const { data, isLoading } = usePlaylists();

  return (
    <LibraryPage>
      <LibraryHeader
        icon={<ListVideo size={24} aria-hidden="true" />}
        title="Playlists"
        actions={
          <Button
            variant="primary"
            iconLeft={<Plus size={18} aria-hidden="true" />}
            onClick={() => setModalOpen(true)}
          >
            Nouvelle playlist
          </Button>
        }
      />

      {isLoading ? (
        <div className="kt-video-grid" aria-hidden="true">
          {Array.from({ length: 8 }, (_, index) => (
            <div key={index} className="flex flex-col gap-2">
              <Skeleton className="aspect-video w-full rounded-kt" />
              <Skeleton variant="text" className="h-4 w-3/4" />
              <Skeleton variant="text" className="h-3 w-1/2" />
            </div>
          ))}
        </div>
      ) : (data?.length ?? 0) === 0 ? (
        <EmptyState
          icon={<ListVideo size={28} aria-hidden="true" />}
          title="Aucune playlist"
          description="Créez une playlist pour regrouper vos vidéos par thème."
          action={
            <Button variant="primary" onClick={() => setModalOpen(true)}>
              Créer une playlist
            </Button>
          }
        />
      ) : (
        <div className="kt-video-grid">
          {data?.map((playlist) => (
            <PlaylistCard
              key={playlist.id}
              playlist={playlist}
              // Les playlists système ont leur page dédiée.
              href={
                playlist.kind === 'WATCH_LATER'
                  ? PATHS.watchLater
                  : playlist.kind === 'LIKED'
                    ? PATHS.liked
                    : undefined
              }
            />
          ))}
        </div>
      )}

      <CreatePlaylistModal open={modalOpen} onClose={() => setModalOpen(false)} />
    </LibraryPage>
  );
}
