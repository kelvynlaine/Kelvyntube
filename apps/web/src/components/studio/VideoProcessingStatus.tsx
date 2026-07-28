'use client';

import { useEffect, useState } from 'react';
import { CircleAlert, CircleCheck, Clock, Loader } from 'lucide-react';
import { WS_EVENTS, type VideoStatus } from '@kelvyntube/shared';
import { Badge, ProgressBar, Tooltip } from '@kelvyntube/ui';
import { useRealtimeEvent } from '@/lib/realtime-context';
import { STATUS_LABELS, isInFlight, isProcessingProgressEvent } from './studio-api';

/**
 * ═══════════════════════════════════════════════════════════════════════════
 *  SUIVI DE TRAITEMENT EN TEMPS RÉEL
 *
 *  Le worker de transcodage publie `WS_EVENTS.processingProgress` dans la room
 *  `video:<id>` avec `{ videoId, progress, status, error? }`. On rejoint cette
 *  room tant que la vidéo n'est pas stabilisée, et la barre avance sans le
 *  moindre rechargement ni polling.
 * ═══════════════════════════════════════════════════════════════════════════
 */

export interface ProcessingState {
  status: VideoStatus;
  progress: number;
  error: string | null;
}

export function useProcessingState(
  videoId: string,
  initialStatus: VideoStatus,
  initialProgress: number,
  initialError: string | null,
): ProcessingState {
  const [state, setState] = useState<ProcessingState>({
    status: initialStatus,
    progress: initialProgress,
    error: initialError,
  });

  // Une refetch React Query peut apporter un état plus frais que le WS
  // (onglet resté en arrière-plan) : on resynchronise sur les valeurs serveur.
  useEffect(() => {
    setState({ status: initialStatus, progress: initialProgress, error: initialError });
  }, [initialStatus, initialProgress, initialError]);

  // On ne rejoint la room que tant que la vidéo bouge encore.
  const room = isInFlight(state.status) ? `video:${videoId}` : undefined;

  useRealtimeEvent(
    WS_EVENTS.processingProgress,
    (data) => {
      if (!isProcessingProgressEvent(data) || data.videoId !== videoId) return;
      setState({
        status: data.status,
        progress: Math.max(0, Math.min(100, data.progress)),
        error: data.error ?? null,
      });
    },
    room,
  );

  return state;
}

export interface VideoProcessingStatusProps {
  videoId: string;
  status: VideoStatus;
  progress: number;
  error: string | null;
  /** Version compacte (cartes latérales). */
  compact?: boolean;
  /** Rend aussi un état « Prête » (masqué par défaut dans les tableaux). */
  showReady?: boolean;
}

/**
 * Indicateur de statut d'une vidéo, alimenté par le WebSocket.
 * - `PROCESSING` / `UPLOADING` : `ProgressBar` qui avance en direct
 * - `FAILED` : badge rouge, message d'erreur complet en infobulle
 * - `READY` : badge discret (optionnel)
 */
export function VideoProcessingStatus({
  videoId,
  status,
  progress,
  error,
  compact = false,
  showReady = false,
}: VideoProcessingStatusProps) {
  const state = useProcessingState(videoId, status, progress, error);

  if (state.status === 'FAILED') {
    return (
      <Tooltip
        content={state.error ?? "Le transcodage a échoué. Réessayez en renvoyant le fichier."}
        side="top"
      >
        <span className="inline-flex">
          <Badge variant="brand" icon={<CircleAlert size={12} aria-hidden="true" />}>
            Échec du traitement
          </Badge>
        </span>
      </Tooltip>
    );
  }

  if (state.status === 'UPLOADED') {
    return (
      <Badge icon={<Clock size={12} aria-hidden="true" />}>{STATUS_LABELS.UPLOADED}</Badge>
    );
  }

  if (state.status === 'PROCESSING' || state.status === 'UPLOADING') {
    const label = state.status === 'UPLOADING' ? 'Envoi' : 'Traitement';
    return (
      <div className={compact ? 'w-full max-w-[10rem]' : 'w-full max-w-[14rem]'}>
        <ProgressBar
          value={state.progress}
          size="sm"
          variant="accent"
          showValue
          label={
            <span className="inline-flex items-center gap-1.5">
              <Loader size={12} aria-hidden="true" className="animate-spin" />
              {label}
            </span>
          }
        />
      </div>
    );
  }

  if (!showReady) return null;

  return (
    <Badge variant="success" icon={<CircleCheck size={12} aria-hidden="true" />}>
      {STATUS_LABELS.READY}
    </Badge>
  );
}
