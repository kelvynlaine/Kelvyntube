/**
 * Point d'entrée du lecteur vidéo Kelvyn Tube.
 * Les pages n'importent QUE depuis ce module.
 */

export { VideoPlayer } from './VideoPlayer';
export type { VideoPlayerProps } from './VideoPlayer';

export { ShortsPlayer } from './ShortsPlayer';
export type { ShortsPlayerProps } from './ShortsPlayer';

export { PlayerControls } from './PlayerControls';
export type { PlayerControlsProps } from './PlayerControls';

export { ProgressBar } from './ProgressBar';
export type { ProgressBarProps } from './ProgressBar';

export { SettingsMenu } from './SettingsMenu';
export type { SettingsMenuProps } from './SettingsMenu';

export { VolumeControl } from './VolumeControl';
export type { VolumeControlProps } from './VolumeControl';

export { CaptionsRenderer } from './CaptionsRenderer';
export type { CaptionsRendererProps } from './CaptionsRenderer';

export {
  ChapterMarkers,
  buildChapterSegments,
  findChapterAt,
} from './ChapterMarkers';
export type { ChapterSegment, BufferedRange } from './ChapterMarkers';

// Hooks et préférences — utiles aux pages (reprise de lecture, mode théâtre).
export { useHlsPlayer } from '@/hooks/useHlsPlayer';
export type {
  PlayerLevel,
  UseHlsPlayerOptions,
  UseHlsPlayerResult,
  VideoElementRef,
} from '@/hooks/useHlsPlayer';

export { useWatchTracking } from '@/hooks/useWatchTracking';
export type {
  UseWatchTrackingOptions,
  UseWatchTrackingResult,
} from '@/hooks/useWatchTracking';

export { usePlayerKeyboard } from '@/hooks/usePlayerKeyboard';
export type {
  PlayerFeedback,
  PlayerFeedbackKind,
  PlayerKeyboardActions,
} from '@/hooks/usePlayerKeyboard';

export {
  DEFAULT_PLAYER_PREFERENCES,
  PLAYBACK_RATES,
  getSessionId,
  readPlayerPreferences,
  writePlayerPreferences,
} from '@/lib/player-storage';
export type { PlayerPreferences } from '@/lib/player-storage';
