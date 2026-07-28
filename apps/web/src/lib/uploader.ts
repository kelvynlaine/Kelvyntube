import { ROUTES, type UploadInitDTO, type UploadStatusDTO } from '@kelvyntube/shared';
import { api, API_BASE, getAccessToken, ApiClientError } from './api';

/**
 * ═══════════════════════════════════════════════════════════════════════════
 *  UPLOAD RESUMABLE PAR CHUNKS
 *
 *  Découpe le fichier, envoie les morceaux en parallèle limité, et surtout
 *  REPREND après une coupure réseau : on redemande l'état au serveur et on
 *  ne renvoie que les chunks manquants.
 *
 *  L'identifiant d'upload est persisté dans `localStorage` avec une empreinte
 *  du fichier — reprendre après un rechargement de page fonctionne aussi.
 * ═══════════════════════════════════════════════════════════════════════════
 */

export type UploadPhase =
  | 'idle'
  | 'preparing'
  | 'uploading'
  | 'finalizing'
  | 'processing'
  | 'done'
  | 'error'
  | 'aborted';

export interface UploadProgress {
  phase: UploadPhase;
  /** 0-100 — progression de l'envoi des octets. */
  uploadPct: number;
  /** 0-100 — progression du transcodage côté serveur. */
  processingPct: number;
  bytesSent: number;
  bytesTotal: number;
  /** Octets par seconde, moyenne glissante. */
  speedBps: number;
  /** Secondes restantes estimées, `null` si inconnu. */
  etaSec: number | null;
  videoId: string | null;
  uploadId: string | null;
  error: string | null;
}

export interface UploaderOptions {
  file: File;
  onProgress?: (progress: UploadProgress) => void;
  /** Appelé dès que l'identifiant vidéo est connu (permet d'ouvrir le formulaire de détails). */
  onVideoId?: (videoId: string) => void;
  /** Nombre de chunks envoyés en parallèle. */
  concurrency?: number;
  /** Nombre de tentatives par chunk avant abandon. */
  maxRetries?: number;
  signal?: AbortSignal;
}

const STORAGE_PREFIX = 'kt_upload:';

/** Empreinte stable d'un fichier (nom + taille + date de modification). */
function fileFingerprint(file: File): string {
  return `${STORAGE_PREFIX}${file.name}:${file.size}:${file.lastModified}`;
}

function loadResumableId(file: File): string | null {
  try {
    return localStorage.getItem(fileFingerprint(file));
  } catch {
    return null;
  }
}

function saveResumableId(file: File, uploadId: string) {
  try {
    localStorage.setItem(fileFingerprint(file), uploadId);
  } catch {
    /* quota dépassé — la reprise après rechargement sera simplement indisponible */
  }
}

function clearResumableId(file: File) {
  try {
    localStorage.removeItem(fileFingerprint(file));
  } catch {
    /* ignoré */
  }
}

const sleep = (ms: number) => new Promise((r) => setTimeout(r, ms));

export class ChunkedUploader {
  private progress: UploadProgress = {
    phase: 'idle',
    uploadPct: 0,
    processingPct: 0,
    bytesSent: 0,
    bytesTotal: 0,
    speedBps: 0,
    etaSec: null,
    videoId: null,
    uploadId: null,
    error: null,
  };

  private startedAt = 0;
  private aborted = false;

  constructor(private options: UploaderOptions) {
    this.progress.bytesTotal = options.file.size;
    options.signal?.addEventListener('abort', () => void this.abort());
  }

  private emit(patch: Partial<UploadProgress>) {
    this.progress = { ...this.progress, ...patch };
    this.options.onProgress?.(this.progress);
  }

  private updateSpeed(bytesSent: number) {
    const elapsed = (Date.now() - this.startedAt) / 1000;
    if (elapsed <= 0) return;
    const speedBps = bytesSent / elapsed;
    const remaining = this.progress.bytesTotal - bytesSent;
    this.emit({
      bytesSent,
      speedBps,
      etaSec: speedBps > 0 ? Math.round(remaining / speedBps) : null,
      uploadPct: Math.min(99, Math.round((bytesSent / this.progress.bytesTotal) * 100)),
    });
  }

  /** Lance (ou reprend) l'upload. Résout avec l'identifiant de la vidéo créée. */
  async start(): Promise<string> {
    const { file } = this.options;
    this.startedAt = Date.now();

    try {
      this.emit({ phase: 'preparing', error: null });

      // ── 1. Reprise éventuelle d'une session existante ────────────────────
      let session: UploadInitDTO | UploadStatusDTO | null = null;
      const savedId = loadResumableId(file);

      if (savedId) {
        try {
          const status = await api.get<UploadStatusDTO>(ROUTES.upload.status(savedId));
          if (!status.completed) session = status;
          else clearResumableId(file);
        } catch {
          // Session expirée ou supprimée côté serveur : on repart de zéro.
          clearResumableId(file);
        }
      }

      // ── 2. Sinon, initialisation d'une nouvelle session ──────────────────
      if (!session) {
        session = await api.post<UploadInitDTO>(ROUTES.upload.init, {
          fileName: file.name,
          fileSizeBytes: file.size,
          mimeType: file.type || 'video/mp4',
        });
        saveResumableId(file, session.uploadId);
      }

      const uploadId = session.uploadId;
      const videoId = session.videoId;
      const chunkSize =
        'chunkSizeBytes' in session
          ? session.chunkSizeBytes
          : Math.ceil(file.size / session.totalChunks);
      const totalChunks = session.totalChunks;
      const received = new Set(session.receivedChunks);

      this.emit({ uploadId, videoId, phase: 'uploading' });
      this.options.onVideoId?.(videoId);

      // ── 3. Envoi des chunks manquants ────────────────────────────────────
      const missing: number[] = [];
      for (let i = 0; i < totalChunks; i += 1) {
        if (!received.has(i)) missing.push(i);
      }

      let bytesSent = (totalChunks - missing.length) * chunkSize;
      bytesSent = Math.min(bytesSent, file.size);
      this.updateSpeed(bytesSent);

      const concurrency = this.options.concurrency ?? 3;
      const queue = [...missing];

      const worker = async () => {
        while (queue.length > 0) {
          if (this.aborted) return;
          const index = queue.shift();
          if (index === undefined) return;

          const start = index * chunkSize;
          const end = Math.min(start + chunkSize, file.size);
          const blob = file.slice(start, end);

          await this.sendChunk(uploadId, index, blob);

          bytesSent += end - start;
          this.updateSpeed(bytesSent);
        }
      };

      await Promise.all(Array.from({ length: concurrency }, worker));

      if (this.aborted) throw new Error('Upload annulé');

      // ── 4. Finalisation ──────────────────────────────────────────────────
      this.emit({ phase: 'finalizing', uploadPct: 100 });
      await api.post<UploadStatusDTO>(ROUTES.upload.complete(uploadId), { uploadId });
      clearResumableId(file);

      this.emit({ phase: 'processing' });
      return videoId;
    } catch (err) {
      if (this.aborted) {
        this.emit({ phase: 'aborted' });
        throw err;
      }
      const message =
        err instanceof ApiClientError
          ? err.message
          : err instanceof Error
            ? err.message
            : 'Échec de l\'upload';
      this.emit({ phase: 'error', error: message });
      throw err;
    }
  }

  /**
   * Envoie un chunk avec retentatives exponentielles.
   * On utilise `fetch` directement (et non le client `api`) pour envoyer un
   * corps binaire brut sans sérialisation JSON.
   */
  private async sendChunk(uploadId: string, index: number, blob: Blob): Promise<void> {
    const maxRetries = this.options.maxRetries ?? 5;
    let lastError: unknown;

    for (let attempt = 0; attempt <= maxRetries; attempt += 1) {
      if (this.aborted) throw new Error('Upload annulé');
      try {
        const token = getAccessToken();
        const res = await fetch(`${API_BASE}${ROUTES.upload.chunk(uploadId, index)}`, {
          method: 'PUT',
          credentials: 'include',
          headers: {
            'Content-Type': 'application/octet-stream',
            ...(token ? { Authorization: `Bearer ${token}` } : {}),
          },
          body: blob,
        });

        if (res.ok) return;

        // 401 : le token a expiré pendant un gros upload → refresh puis nouvelle tentative
        if (res.status === 401 && (await api.refresh())) continue;

        // 4xx (hors 401/408/429) : inutile de réessayer
        if (res.status >= 400 && res.status < 500 && ![408, 429].includes(res.status)) {
          const body = await res.json().catch(() => null);
          throw new Error(body?.error?.message ?? `Chunk ${index} refusé (${res.status})`);
        }

        lastError = new Error(`Chunk ${index} : erreur ${res.status}`);
      } catch (err) {
        lastError = err;
      }

      // Attente exponentielle avec gigue : 0,5 s, 1 s, 2 s, 4 s, 8 s (max 10 s)
      const delay = Math.min(500 * 2 ** attempt, 10_000) * (0.7 + Math.random() * 0.6);
      await sleep(delay);
    }

    throw lastError instanceof Error
      ? lastError
      : new Error(`Échec de l'envoi du chunk ${index}`);
  }

  /** Annule l'upload et libère la session côté serveur. */
  async abort(): Promise<void> {
    this.aborted = true;
    const { uploadId } = this.progress;
    if (uploadId) {
      try {
        await api.delete(ROUTES.upload.abort(uploadId));
      } catch {
        /* la session expirera d'elle-même */
      }
      clearResumableId(this.options.file);
    }
    this.emit({ phase: 'aborted' });
  }

  getProgress(): UploadProgress {
    return this.progress;
  }
}

/** Formate un débit en unité lisible ("4,2 Mo/s"). */
export function formatSpeed(bps: number): string {
  if (bps <= 0) return '—';
  const units = ['o/s', 'Ko/s', 'Mo/s', 'Go/s'];
  let value = bps;
  let unit = 0;
  while (value >= 1024 && unit < units.length - 1) {
    value /= 1024;
    unit += 1;
  }
  return `${value.toFixed(value < 10 ? 1 : 0)} ${units[unit]}`;
}

/** Formate une durée restante ("3 min 20 s"). */
export function formatEta(seconds: number | null): string {
  if (seconds === null || !Number.isFinite(seconds)) return '—';
  if (seconds < 60) return `${Math.round(seconds)} s`;
  const min = Math.floor(seconds / 60);
  const sec = Math.round(seconds % 60);
  if (min < 60) return `${min} min${sec ? ` ${sec} s` : ''}`;
  const h = Math.floor(min / 60);
  return `${h} h ${min % 60} min`;
}

/** Formate une taille de fichier ("1,4 Go"). */
export function formatBytes(bytes: number): string {
  const units = ['o', 'Ko', 'Mo', 'Go', 'To'];
  let value = bytes;
  let unit = 0;
  while (value >= 1024 && unit < units.length - 1) {
    value /= 1024;
    unit += 1;
  }
  return `${value.toFixed(value < 10 && unit > 0 ? 1 : 0)} ${units[unit]}`;
}
