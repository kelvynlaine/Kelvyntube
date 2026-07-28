'use client';

import { ListVideo } from 'lucide-react';
import { EmptyState } from '@kelvyntube/ui';
import { ChannelTabPanel } from '@/components/channel/ChannelTabs';
import { ChannelErrorState } from '@/components/channel/ChannelStates';
import { PlaylistCard, PlaylistCardSkeleton } from '@/components/channel/PlaylistCard';
import { useChannelPlaylists } from '@/components/channel/queries';
import { useCurrentChannel } from '@/components/channel/useChannelRoute';

const GRID_CLASS = 'kt-video-grid';

/** Onglet Playlists : grille de cartes de playlist. */
export default function ChannelPlaylistsPage() {
  const { channel } = useCurrentChannel();
  const { data, isPending, isError, error, refetch } = useChannelPlaylists(channel?.id);

  return (
    <ChannelTabPanel tab="playlists">
      {isPending ? (
        <div className={GRID_CLASS}>
          {Array.from({ length: 8 }, (_, i) => (
            <PlaylistCardSkeleton key={i} />
          ))}
        </div>
      ) : isError ? (
        <ChannelErrorState error={error} onRetry={() => void refetch()} />
      ) : data.length === 0 ? (
        <EmptyState
          icon={<ListVideo size={28} />}
          title="Aucune playlist publique"
          description="Cette chaîne n’a pas encore créé de playlist visible."
        />
      ) : (
        <div className={GRID_CLASS}>
          {data.map((playlist) => (
            <PlaylistCard key={playlist.id} playlist={playlist} />
          ))}
        </div>
      )}
    </ChannelTabPanel>
  );
}
