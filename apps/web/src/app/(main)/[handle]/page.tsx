'use client';

import { Clapperboard } from 'lucide-react';
import { EmptyState } from '@kelvyntube/ui';
import { ChannelTabPanel, channelTabHref } from '@/components/channel/ChannelTabs';
import { ChannelTrailer } from '@/components/channel/ChannelTrailer';
import { ChannelVideoRow } from '@/components/channel/ChannelVideoRow';
import { ChannelErrorState, ChannelRowSkeleton } from '@/components/channel/ChannelStates';
import { useChannelHome } from '@/components/channel/queries';
import { useCurrentChannel } from '@/components/channel/useChannelRoute';

/**
 * Onglet Accueil : bande-annonce (visiteurs non abonnés), vidéos mises en
 * avant, puis les sections renvoyées par l'API en rangées horizontales.
 */
export default function ChannelHomePage() {
  const { handle, channel } = useCurrentChannel();
  const { data, isPending, isError, error, refetch } = useChannelHome(channel?.id);

  return (
    <ChannelTabPanel tab="accueil">
      {isPending ? (
        <>
          <ChannelRowSkeleton />
          <ChannelRowSkeleton />
        </>
      ) : isError ? (
        <ChannelErrorState error={error} onRetry={() => void refetch()} />
      ) : (
        <>
          {data.trailer ? <ChannelTrailer video={data.trailer} /> : null}

          {data.featured.length > 0 ? (
            <ChannelVideoRow
              title="À la une"
              videos={data.featured}
              moreHref={channelTabHref(handle, 'videos')}
            />
          ) : null}

          {data.sections.map((section) => (
            <ChannelVideoRow
              key={section.title}
              title={section.title}
              videos={section.videos}
            />
          ))}

          {!data.trailer && data.featured.length === 0 && data.sections.length === 0 ? (
            <EmptyState
              icon={<Clapperboard size={28} />}
              title="Cette chaîne n’a encore rien publié"
              description="Reviens plus tard pour découvrir ses premières vidéos."
            />
          ) : null}
        </>
      )}
    </ChannelTabPanel>
  );
}
