'use client';

import { useCallback, useState } from 'react';
import { Ban, Bookmark, Download, Flag, MoreHorizontal, Share2 } from 'lucide-react';
import {
  Button,
  DropdownMenu,
  IconButton,
  LikeBar,
  useToast,
  type DropdownMenuItem,
} from '@kelvyntube/ui';
import type { LikeState, VideoDetailDTO } from '@kelvyntube/shared';
import { useAuth } from '@/lib/auth-context';
import { ShareModal } from './ShareModal';
import { SaveToPlaylistModal } from './SaveToPlaylistModal';

export interface VideoActionsProps {
  video: VideoDetailDTO;
  /** Position courante du lecteur, lue à l'ouverture du partage. */
  getCurrentTime: () => number;
  onLike: (direction: Exclude<LikeState, 'NONE'>) => Promise<void>;
  playlistId?: string | null;
  className?: string;
}

/** Barre d'actions : j'aime, partage, enregistrement et menu secondaire. */
export function VideoActions({
  video,
  getCurrentTime,
  onLike,
  playlistId,
  className,
}: VideoActionsProps) {
  const { user, requireAuth } = useAuth();
  const { toast } = useToast();

  const [shareOpen, setShareOpen] = useState(false);
  const [saveOpen, setSaveOpen] = useState(false);
  const [shareTime, setShareTime] = useState(0);

  const guard = useCallback(
    (action: string) => {
      if (user) return true;
      requireAuth(action);
      return false;
    },
    [requireAuth, user],
  );

  const handleLike = useCallback(
    (direction: Exclude<LikeState, 'NONE'>) => {
      if (!guard(direction === 'LIKE' ? 'aimer' : 'ne pas aimer')) return;
      void onLike(direction).catch(() => {
        toast({ message: 'Action impossible pour le moment.', variant: 'error' });
      });
    },
    [guard, onLike, toast],
  );

  const menuItems: DropdownMenuItem[] = [
    {
      id: 'report',
      label: 'Signaler',
      icon: <Flag size={18} />,
      onSelect: () => {
        if (!guard('signaler')) return;
        toast({
          message: 'Merci, cette vidéo a été signalée à la modération.',
          variant: 'success',
        });
      },
    },
    {
      id: 'download',
      label: 'Télécharger',
      icon: <Download size={18} />,
      disabled: !video.mp4FallbackUrl,
      onSelect: () => {
        if (!guard('télécharger')) return;
        if (!video.mp4FallbackUrl) return;
        window.open(video.mp4FallbackUrl, '_blank', 'noopener,noreferrer');
      },
    },
    { id: 'sep', separator: true },
    {
      id: 'not-interested',
      label: 'Ne pas recommander',
      icon: <Ban size={18} />,
      danger: true,
      onSelect: () => {
        if (!guard('personnaliser vos recommandations')) return;
        toast({ message: 'Cette chaîne sera moins recommandée.' });
      },
    },
  ];

  return (
    /*
     * Comportement YouTube mobile : la rangée d'actions déborde volontairement
     * et défile horizontalement plutôt que de comprimer ses boutons (la
     * `LikeBar` tombait à ~33 px de large et son compteur devenait illisible).
     * Chaque action est donc `shrink-0`, et la rangée « saigne » jusqu'aux
     * bords de l'écran (`-mx-4 px-4`) pour signaler qu'il y a une suite.
     * À partir de 1015 px la rangée tient sur une ligne : on annule le bleed.
     */
    <div
      className={`kt-no-scrollbar -mx-4 flex items-center gap-2 overflow-x-auto px-4 min-[1015px]:mx-0 min-[1015px]:px-0 ${className ?? ''}`}
    >
      <LikeBar
        likeCount={video.likeCount}
        dislikeCount={video.dislikeCount}
        state={video.viewer.like}
        onLike={() => handleLike('LIKE')}
        onDislike={() => handleLike('DISLIKE')}
        className="shrink-0"
      />

      <Button
        variant="secondary"
        className="shrink-0"
        iconLeft={<Share2 size={18} aria-hidden="true" />}
        onClick={() => {
          setShareTime(getCurrentTime());
          setShareOpen(true);
        }}
      >
        Partager
      </Button>

      <Button
        variant="secondary"
        className="shrink-0"
        iconLeft={<Bookmark size={18} aria-hidden="true" />}
        onClick={() => {
          if (!guard('enregistrer')) return;
          setSaveOpen(true);
        }}
      >
        Enregistrer
      </Button>

      <DropdownMenu
        items={menuItems}
        align="end"
        label="Plus d'actions sur la vidéo"
        trigger={(triggerProps) => (
          <IconButton
            {...triggerProps}
            aria-label="Plus d'actions sur la vidéo"
            variant="solid"
            className="shrink-0"
          >
            <MoreHorizontal size={20} />
          </IconButton>
        )}
      />

      <ShareModal
        open={shareOpen}
        onClose={() => setShareOpen(false)}
        video={video}
        currentTime={shareTime}
        playlistId={playlistId}
      />

      {user ? (
        <SaveToPlaylistModal
          open={saveOpen}
          onClose={() => setSaveOpen(false)}
          videoId={video.id}
        />
      ) : null}
    </div>
  );
}
