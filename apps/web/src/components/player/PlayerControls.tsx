'use client';

import clsx from 'clsx';
import type { ReactNode, RefObject } from 'react';
import {
  Captions,
  CaptionsOff,
  Maximize,
  Minimize,
  Pause,
  PictureInPicture2,
  Play,
  RectangleHorizontal,
  RotateCcw,
  Settings,
  SkipForward,
} from 'lucide-react';
import { formatDuration } from '@kelvyntube/shared';
import { VolumeControl } from './VolumeControl';

export interface PlayerControlsProps {
  playing: boolean;
  ended: boolean;
  onTogglePlay: () => void;
  /** Vidéo suivante (file d'attente / playlist). */
  onNext?: () => void;

  volume: number;
  muted: boolean;
  onVolumeChange: (volume: number) => void;
  onToggleMute: () => void;

  currentTime: number;
  duration: number;

  captionsAvailable: boolean;
  captionsOn: boolean;
  onToggleCaptions: () => void;

  settingsOpen: boolean;
  onToggleSettings: () => void;
  settingsButtonRef?: RefObject<HTMLButtonElement | null>;
  /** Panneau des réglages, rendu ancré au bouton. */
  settingsMenu?: ReactNode;

  pipSupported: boolean;
  pipActive: boolean;
  onTogglePip: () => void;

  theaterAvailable: boolean;
  theaterMode: boolean;
  onToggleTheater: () => void;

  isFullscreen: boolean;
  onToggleFullscreen: () => void;

  /** Zones tactiles agrandies (plein écran / mobile). */
  large?: boolean;
  className?: string;
}

/** Rangée de contrôles sous la barre de progression. */
export function PlayerControls({
  playing,
  ended,
  onTogglePlay,
  onNext,
  volume,
  muted,
  onVolumeChange,
  onToggleMute,
  currentTime,
  duration,
  captionsAvailable,
  captionsOn,
  onToggleCaptions,
  settingsOpen,
  onToggleSettings,
  settingsButtonRef,
  settingsMenu,
  pipSupported,
  pipActive,
  onTogglePip,
  theaterAvailable,
  theaterMode,
  onToggleTheater,
  isFullscreen,
  onToggleFullscreen,
  large = false,
  className,
}: PlayerControlsProps) {
  const buttonClass = clsx(
    'inline-flex shrink-0 items-center justify-center rounded-full text-white/95',
    'transition-opacity hover:opacity-80 disabled:opacity-40 kt-focus-ring',
    large ? 'h-11 w-11' : 'h-9 w-9',
  );
  const iconClass = large ? 'h-7 w-7' : 'h-6 w-6';

  const PlayIcon = ended ? RotateCcw : playing ? Pause : Play;
  const playLabel = ended ? 'Revoir (k)' : playing ? 'Mettre en pause (k)' : 'Lire (k)';

  return (
    <div className={clsx('flex items-center gap-1 px-1 sm:px-2', className)}>
      <button type="button" onClick={onTogglePlay} aria-label={playLabel} className={buttonClass}>
        <PlayIcon className={iconClass} aria-hidden="true" />
      </button>

      {onNext ? (
        <button
          type="button"
          onClick={onNext}
          aria-label="Vidéo suivante"
          className={buttonClass}
        >
          <SkipForward className={iconClass} aria-hidden="true" />
        </button>
      ) : null}

      <VolumeControl
        volume={volume}
        muted={muted}
        onVolumeChange={onVolumeChange}
        onToggleMute={onToggleMute}
        large={large}
      />

      <span
        className={clsx(
          'ml-1 select-none whitespace-nowrap tabular-nums text-white/95',
          large ? 'text-kt-base' : 'text-kt-sm',
        )}
      >
        <span className="sr-only">Position : </span>
        {formatDuration(currentTime)}
        <span className="mx-1 text-white/60">/</span>
        {formatDuration(duration)}
      </span>

      <span className="flex-1" />

      {captionsAvailable ? (
        <button
          type="button"
          onClick={onToggleCaptions}
          aria-label={captionsOn ? 'Désactiver les sous-titres (c)' : 'Activer les sous-titres (c)'}
          aria-pressed={captionsOn}
          className={clsx(
            buttonClass,
            captionsOn && 'after:absolute after:bottom-[6px] after:h-[2px] after:w-4 after:bg-white relative',
          )}
        >
          {captionsOn ? (
            <Captions className={iconClass} aria-hidden="true" />
          ) : (
            <CaptionsOff className={iconClass} aria-hidden="true" />
          )}
        </button>
      ) : null}

      <div className="relative">
        <button
          type="button"
          ref={settingsButtonRef}
          onClick={onToggleSettings}
          aria-label="Réglages"
          aria-haspopup="menu"
          aria-expanded={settingsOpen}
          className={buttonClass}
        >
          <Settings
            className={clsx(
              iconClass,
              'transition-transform duration-200 ease-kt motion-reduce:transition-none',
              settingsOpen && 'rotate-45',
            )}
            aria-hidden="true"
          />
        </button>
        {settingsMenu}
      </div>

      {pipSupported ? (
        <button
          type="button"
          onClick={onTogglePip}
          aria-label={pipActive ? 'Quitter le mini-lecteur (i)' : 'Mini-lecteur (i)'}
          aria-pressed={pipActive}
          className={buttonClass}
        >
          <PictureInPicture2 className={iconClass} aria-hidden="true" />
        </button>
      ) : null}

      {theaterAvailable ? (
        <button
          type="button"
          onClick={onToggleTheater}
          aria-label={theaterMode ? 'Mode par défaut (t)' : 'Mode théâtre (t)'}
          aria-pressed={theaterMode}
          className={clsx(buttonClass, 'hidden sm:inline-flex')}
        >
          <RectangleHorizontal
            className={clsx(iconClass, theaterMode && 'scale-90')}
            aria-hidden="true"
          />
        </button>
      ) : null}

      <button
        type="button"
        onClick={onToggleFullscreen}
        aria-label={isFullscreen ? 'Quitter le plein écran (f)' : 'Plein écran (f)'}
        aria-pressed={isFullscreen}
        className={buttonClass}
      >
        {isFullscreen ? (
          <Minimize className={iconClass} aria-hidden="true" />
        ) : (
          <Maximize className={iconClass} aria-hidden="true" />
        )}
      </button>
    </div>
  );
}

export default PlayerControls;
