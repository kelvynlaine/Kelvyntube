'use client';

import type { ChannelDTO } from '@kelvyntube/shared';
import { Modal } from '@kelvyntube/ui';
import { ChannelAbout } from './ChannelAbout';
import { ShareChannelButton } from './ShareChannelButton';

export interface ChannelAboutModalProps {
  channel: ChannelDTO;
  open: boolean;
  onClose: () => void;
}

/** Modale « À propos » ouverte depuis le lien « ...plus » de l'en-tête. */
export function ChannelAboutModal({ channel, open, onClose }: ChannelAboutModalProps) {
  return (
    <Modal open={open} onClose={onClose} title="À propos" size="md">
      <ChannelAbout
        channel={channel}
        footer={<ShareChannelButton handle={channel.handle} label="Partager la chaîne" />}
      />
    </Modal>
  );
}
