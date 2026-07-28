/**
 * Page de visionnage (`/watch`).
 * Les routes n'importent QUE depuis ce fichier.
 */

export { WatchShell } from './WatchShell';
export { WatchLayout } from './WatchLayout';
export type { WatchLayoutProps } from './WatchLayout';

export { WatchSkeleton } from './WatchSkeleton';

export { VideoInfo } from './VideoInfo';
export type { VideoInfoProps } from './VideoInfo';

export { ChannelRow } from './ChannelRow';
export type { ChannelRowProps } from './ChannelRow';

export { VideoActions } from './VideoActions';
export type { VideoActionsProps } from './VideoActions';

export { VideoDescription } from './VideoDescription';
export type { VideoDescriptionProps } from './VideoDescription';

export { ChapterList } from './ChapterList';
export type { ChapterListProps } from './ChapterList';

export { RelatedVideos, useRelatedVideos } from './RelatedVideos';
export type { RelatedVideosProps } from './RelatedVideos';

export { PlaylistPanel, usePlaylist } from './PlaylistPanel';
export type { PlaylistPanelProps } from './PlaylistPanel';

export { ShareModal } from './ShareModal';
export type { ShareModalProps } from './ShareModal';

export { SaveToPlaylistModal } from './SaveToPlaylistModal';
export type { SaveToPlaylistModalProps } from './SaveToPlaylistModal';

export { AutoplayOverlay } from './AutoplayOverlay';
export type { AutoplayOverlayProps } from './AutoplayOverlay';

export { usePlayerBridge, usePlaybackPosition } from './usePlayerBridge';
export type { PlayerBridge } from './usePlayerBridge';

export { useWatchVideo, videoQueryKey } from './useWatchVideo';
export type { UseWatchVideoOptions } from './useWatchVideo';
