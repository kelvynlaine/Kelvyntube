'use client';

import { useEffect } from 'react';
import type { CaptionDTO } from '@kelvyntube/shared';
import type { VideoElementRef } from '@/hooks/useHlsPlayer';

export interface CaptionsRendererProps {
  captions: CaptionDTO[];
  /** Langue affichée ; `null` = toutes les pistes désactivées. */
  activeLang: string | null;
  videoRef: VideoElementRef;
}

/**
 * Déclare les pistes `<track kind="subtitles">` et pilote la piste active.
 * ⚠️ Doit être rendu comme ENFANT direct de l'élément `<video>`.
 * Le rendu visuel reste celui du navigateur (styles natifs des sous-titres).
 */
export function CaptionsRenderer({ captions, activeLang, videoRef }: CaptionsRendererProps) {
  useEffect(() => {
    const video = videoRef.current;
    if (!video) return;

    /** Active la bonne piste et désactive toutes les autres. */
    const syncTracks = () => {
      const tracks = video.textTracks;
      for (let i = 0; i < tracks.length; i += 1) {
        const track = tracks[i];
        if (track.kind !== 'subtitles' && track.kind !== 'captions') continue;
        const matches = activeLang !== null && track.language === activeLang;
        // `hidden` plutôt que `disabled` : les cues restent chargés.
        track.mode = matches ? 'showing' : 'disabled';
      }
    };

    syncTracks();
    // Les pistes peuvent être ajoutées après coup (hls.js, chargement du VTT).
    video.textTracks.addEventListener('addtrack', syncTracks);
    return () => video.textTracks.removeEventListener('addtrack', syncTracks);
  }, [activeLang, captions, videoRef]);

  return (
    <>
      {captions.map((caption) => (
        <track
          key={`${caption.language}-${caption.url}`}
          kind="subtitles"
          src={caption.url}
          srcLang={caption.language}
          label={caption.auto ? `${caption.label} (auto)` : caption.label}
        />
      ))}
    </>
  );
}

export default CaptionsRenderer;
