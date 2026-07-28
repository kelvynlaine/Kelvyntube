'use client';

import { useCallback, useState } from 'react';
import Link from 'next/link';
import { ChannelAvatar, SubscribeButton, useToast } from '@kelvyntube/ui';
import type { NotificationLevel, VideoDetailDTO } from '@kelvyntube/shared';
import { useAuth } from '@/lib/auth-context';
import { PATHS } from '@/lib/nav';

export interface ChannelRowProps {
  video: VideoDetailDTO;
  onSubscribe: (level?: NotificationLevel) => Promise<void>;
  onUnsubscribe: () => Promise<void>;
  onLevelChange: (level: NotificationLevel) => Promise<void>;
  className?: string;
}

/** Chaîne de la vidéo : avatar 48 px, nom vérifié, abonnés et abonnement. */
export function ChannelRow({
  video,
  onSubscribe,
  onUnsubscribe,
  onLevelChange,
  className,
}: ChannelRowProps) {
  const { user, requireAuth } = useAuth();
  const { toast } = useToast();
  const [pending, setPending] = useState(false);

  const run = useCallback(
    async (action: () => Promise<void>, label: string) => {
      if (!user) {
        requireAuth(label);
        return;
      }
      setPending(true);
      try {
        await action();
      } catch {
        toast({ message: 'Action impossible pour le moment.', variant: 'error' });
      } finally {
        setPending(false);
      }
    },
    [requireAuth, toast, user],
  );

  const subscribed = video.viewer.isSubscribed;
  const isOwner = video.channel.viewer.isOwner;

  return (
    <div className={`flex min-w-0 items-center gap-3 ${className ?? ''}`}>
      <ChannelAvatar
        channel={video.channel}
        size="md"
        showName
        showSubscribers
        href={PATHS.channel(video.channel.handle)}
        linkComponent={Link}
        nameClassName="text-kt-md"
        /*
         * La maquette demande 48 px : on agrandit l'avatar du composant.
         * `min-w-0 flex-1` + `shrink-0` sur l'avatar : à 320 px c'est le NOM
         * qui se tronque, jamais l'avatar ni le bouton « S'abonner » qui
         * seraient sinon poussés hors de l'écran.
         */
        className="min-w-0 flex-1 [&>span:first-child]:size-12 [&>span:first-child]:shrink-0 [&>span:first-child]:text-kt-md"
      />

      {isOwner ? null : (
        <SubscribeButton
          subscribed={subscribed}
          notificationLevel={video.viewer.notificationLevel}
          loading={pending}
          className="ml-2 shrink-0"
          onSubscribe={() => void run(() => onSubscribe('PERSONALIZED'), "s'abonner")}
          onUnsubscribe={() => void run(onUnsubscribe, 'se désabonner')}
          onLevelChange={(level) =>
            void run(() => onLevelChange(level), 'gérer les notifications')
          }
        />
      )}
    </div>
  );
}
