'use client';

import { Skeleton } from '@kelvyntube/ui';
import { ChannelAbout } from '@/components/channel/ChannelAbout';
import { ChannelTabPanel } from '@/components/channel/ChannelTabs';
import { ChannelErrorState } from '@/components/channel/ChannelStates';
import { ShareChannelButton } from '@/components/channel/ShareChannelButton';
import { useCurrentChannel } from '@/components/channel/useChannelRoute';

/** Onglet À propos : description complète, liens, statistiques et partage. */
export default function ChannelAboutPage() {
  const { channel, isPending, isError, error, refetch } = useCurrentChannel();

  return (
    <ChannelTabPanel tab="a-propos">
      <div className="max-w-2xl">
        {isPending ? (
          <div className="flex flex-col gap-4" aria-hidden="true">
            <Skeleton variant="text" className="h-4 w-full" />
            <Skeleton variant="text" className="h-4 w-5/6" />
            <Skeleton variant="text" className="h-4 w-1/2" />
          </div>
        ) : isError || !channel ? (
          <ChannelErrorState error={error} onRetry={() => void refetch()} />
        ) : (
          <ChannelAbout
            channel={channel}
            footer={
              <ShareChannelButton handle={channel.handle} label="Partager la chaîne" />
            }
          />
        )}
      </div>
    </ChannelTabPanel>
  );
}
