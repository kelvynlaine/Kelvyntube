'use client';

import { useEffect, useRef, useState } from 'react';
import { Play, X } from 'lucide-react';
import { Button } from '@kelvyntube/ui';
import type { VideoCardDTO } from '@kelvyntube/shared';

export interface AutoplayOverlayProps {
  next: VideoCardDTO;
  /** Durée du compte à rebours en secondes. */
  seconds?: number;
  onCancel: () => void;
  onPlayNow: () => void;
}

/**
 * Compte à rebours affiché en surimpression du lecteur à la fin d'une vidéo.
 * Annulable au clic ou avec Échap.
 */
export function AutoplayOverlay({
  next,
  seconds = 5,
  onCancel,
  onPlayNow,
}: AutoplayOverlayProps) {
  const [remaining, setRemaining] = useState(seconds);
  /** Empêche une double navigation si le composant se re-rend à 0. */
  const firedRef = useRef(false);

  useEffect(() => {
    const timer = window.setInterval(() => {
      setRemaining((current) => (current > 0 ? current - 1 : 0));
    }, 1000);
    return () => window.clearInterval(timer);
  }, []);

  // Déclenche la navigation une fois le décompte terminé.
  useEffect(() => {
    if (remaining > 0 || firedRef.current) return;
    firedRef.current = true;
    onPlayNow();
  }, [onPlayNow, remaining]);

  useEffect(() => {
    const onKeyDown = (event: KeyboardEvent) => {
      if (event.key === 'Escape') onCancel();
    };
    document.addEventListener('keydown', onKeyDown);
    return () => document.removeEventListener('keydown', onKeyDown);
  }, [onCancel]);

  return (
    <div
      role="alertdialog"
      aria-label="Lecture de la vidéo suivante"
      className="absolute inset-0 z-40 flex flex-col items-center justify-center gap-4 bg-black/85 p-6 text-center text-white"
    >
      <p className="text-kt-sm uppercase tracking-wide text-white/70">
        Lecture suivante dans{' '}
        <span className="tabular-nums font-medium text-white">{remaining}</span> s
      </p>

      <div className="flex max-w-md items-center gap-3">
        {next.thumbnailUrl ? (
          <img
            src={next.thumbnailUrl}
            alt=""
            className="h-[54px] w-24 shrink-0 rounded object-cover"
          />
        ) : null}
        <p className="kt-clamp-2 text-left text-kt-md font-medium">{next.title}</p>
      </div>

      <div className="flex items-center gap-2">
        <Button
          variant="outline"
          iconLeft={<X size={16} aria-hidden="true" />}
          onClick={onCancel}
          className="border-white/40 text-white hover:bg-white/10"
        >
          Annuler
        </Button>
        <Button
          variant="brand"
          iconLeft={<Play size={16} aria-hidden="true" />}
          onClick={onPlayNow}
        >
          Lire maintenant
        </Button>
      </div>
    </div>
  );
}
