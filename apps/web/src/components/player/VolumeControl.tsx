'use client';

import clsx from 'clsx';
import { useCallback, useRef, useState } from 'react';
import { Volume1, Volume2, VolumeX } from 'lucide-react';

export interface VolumeControlProps {
  /** Volume normalisé 0 → 1. */
  volume: number;
  muted: boolean;
  onVolumeChange: (volume: number) => void;
  onToggleMute: () => void;
  /** Zones tactiles agrandies (plein écran mobile). */
  large?: boolean;
  className?: string;
}

/**
 * Bouton de sourdine + curseur de volume qui se déploie au survol
 * ou au focus clavier, comme sur YouTube.
 */
export function VolumeControl({
  volume,
  muted,
  onVolumeChange,
  onToggleMute,
  large = false,
  className,
}: VolumeControlProps) {
  const trackRef = useRef<HTMLDivElement | null>(null);
  const [dragging, setDragging] = useState(false);

  const effective = muted ? 0 : volume;
  const percent = Math.round(effective * 100);

  const ratioFromClientX = useCallback((clientX: number): number => {
    const track = trackRef.current;
    if (!track) return 0;
    const rect = track.getBoundingClientRect();
    if (rect.width <= 0) return 0;
    return Math.min(1, Math.max(0, (clientX - rect.left) / rect.width));
  }, []);

  const handlePointerDown = useCallback(
    (event: React.PointerEvent<HTMLDivElement>) => {
      if (event.button !== 0 && event.pointerType === 'mouse') return;
      event.preventDefault();
      event.currentTarget.setPointerCapture(event.pointerId);
      setDragging(true);
      onVolumeChange(ratioFromClientX(event.clientX));
    },
    [onVolumeChange, ratioFromClientX],
  );

  const handlePointerMove = useCallback(
    (event: React.PointerEvent<HTMLDivElement>) => {
      if (!dragging) return;
      onVolumeChange(ratioFromClientX(event.clientX));
    },
    [dragging, onVolumeChange, ratioFromClientX],
  );

  const endDrag = useCallback((event: React.PointerEvent<HTMLDivElement>) => {
    if (event.currentTarget.hasPointerCapture(event.pointerId)) {
      event.currentTarget.releasePointerCapture(event.pointerId);
    }
    setDragging(false);
  }, []);

  const handleKeyDown = useCallback(
    (event: React.KeyboardEvent<HTMLDivElement>) => {
      let next: number | null = null;
      switch (event.key) {
        case 'ArrowLeft':
        case 'ArrowDown':
          next = effective - 0.05;
          break;
        case 'ArrowRight':
        case 'ArrowUp':
          next = effective + 0.05;
          break;
        case 'Home':
          next = 0;
          break;
        case 'End':
          next = 1;
          break;
        default:
          return;
      }
      event.preventDefault();
      event.stopPropagation();
      onVolumeChange(Math.min(1, Math.max(0, next)));
    },
    [effective, onVolumeChange],
  );

  const Icon = muted || volume === 0 ? VolumeX : volume < 0.5 ? Volume1 : Volume2;

  return (
    <div className={clsx('group/volume flex items-center', className)}>
      <button
        type="button"
        onClick={onToggleMute}
        aria-label={muted || volume === 0 ? 'Activer le son (m)' : 'Couper le son (m)'}
        aria-pressed={muted}
        className={clsx(
          'inline-flex items-center justify-center rounded-full text-white/95 transition-opacity hover:opacity-80 kt-focus-ring',
          large ? 'h-11 w-11' : 'h-9 w-9',
        )}
      >
        <Icon className={large ? 'h-7 w-7' : 'h-6 w-6'} aria-hidden="true" />
      </button>

      {/* Curseur : largeur animée au survol / focus, toujours ouvert en glissant */}
      <div
        className={clsx(
          'overflow-hidden transition-[width,opacity] duration-200 ease-kt motion-reduce:transition-none',
          dragging
            ? 'w-[64px] opacity-100'
            : 'w-0 opacity-0 group-hover/volume:w-[64px] group-hover/volume:opacity-100 group-focus-within/volume:w-[64px] group-focus-within/volume:opacity-100',
        )}
      >
        <div
          ref={trackRef}
          role="slider"
          tabIndex={0}
          aria-label="Volume"
          aria-valuemin={0}
          aria-valuemax={100}
          aria-valuenow={percent}
          aria-valuetext={`${percent} %`}
          aria-orientation="horizontal"
          onPointerDown={handlePointerDown}
          onPointerMove={handlePointerMove}
          onPointerUp={endDrag}
          onPointerCancel={endDrag}
          onKeyDown={handleKeyDown}
          className={clsx(
            'relative mx-2 cursor-pointer touch-none rounded-sm outline-none kt-focus-ring',
            large ? 'h-8' : 'h-6',
          )}
        >
          <span className="absolute inset-x-0 top-1/2 h-[3px] -translate-y-1/2 rounded-full bg-white/30" />
          <span
            className="absolute left-0 top-1/2 h-[3px] -translate-y-1/2 rounded-full bg-white"
            style={{ width: `${percent}%` }}
          />
          <span
            className="absolute top-1/2 -ml-[6px] h-3 w-3 -translate-y-1/2 rounded-full bg-white"
            style={{ left: `${percent}%` }}
          />
        </div>
      </div>
    </div>
  );
}

export default VolumeControl;
