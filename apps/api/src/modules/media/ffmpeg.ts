import { execFile, spawn } from 'node:child_process';
import { promisify } from 'node:util';
import fs from 'node:fs/promises';
import path from 'node:path';
import { env } from '../../config/env.js';

/**
 * ═══════════════════════════════════════════════════════════════════════════
 *  WRAPPER FFMPEG / FFPROBE
 *
 *  On pilote les binaires directement (`child_process`) plutôt que via
 *  `fluent-ffmpeg` : moins de magie, erreurs explicites, et progression fine
 *  grâce à `-progress pipe:1`.
 *
 *  IMPORTANT : ffmpeg peut être totalement absent de la machine.
 *  `isFfmpegAvailable()` permet aux workers de basculer en mode dégradé
 *  au lieu de planter.
 * ═══════════════════════════════════════════════════════════════════════════
 */

const execFileAsync = promisify(execFile);

// ── Types publics ──────────────────────────────────────────────────────────

export interface ProbeResult {
  /** Durée en secondes (fractionnaire). */
  durationSec: number;
  /** Largeur d'affichage (rotation appliquée). */
  width: number;
  /** Hauteur d'affichage (rotation appliquée). */
  height: number;
  /** Débit global en bits/s (0 si inconnu). */
  bitrate: number;
  hasAudio: boolean;
  fps: number;
  /** Rotation déclarée dans les métadonnées : 0 | 90 | 180 | 270. */
  rotation: number;
}

/** Une résolution cible (compatible avec les entrées de `RENDITIONS`). */
export interface Rendition {
  label: string;
  width: number;
  height: number;
  bitrateKbps: number;
  audioKbps: number;
}

/** Métadonnées source réutilisables pour éviter de re-probe à chaque étape. */
export interface SourceMeta {
  width: number;
  height: number;
  durationSec: number;
  hasAudio: boolean;
}

export interface HlsVariantResult {
  label: string;
  width: number;
  height: number;
  bitrateKbps: number;
  audioKbps: number;
  /** Chemin absolu du `index.m3u8` généré. */
  playlistFile: string;
  /** Chemins absolus des segments `.ts`. */
  segmentFiles: string[];
  /** Taille cumulée des segments (octets). */
  sizeBytes: number;
}

export interface SpriteSheetResult {
  outPath: string;
  columns: number;
  rows: number;
  tileWidth: number;
  tileHeight: number;
  /** Intervalle entre deux vignettes (secondes). */
  intervalSec: number;
  count: number;
}

export type ProgressCallback = (ratio: number) => void;

// ── Disponibilité des binaires ─────────────────────────────────────────────

let availabilityCache: boolean | null = null;

/**
 * Teste `ffmpeg -version` ET `ffprobe -version`.
 * Le résultat est mis en cache (les binaires n'apparaissent pas en cours de run).
 */
export async function isFfmpegAvailable(force = false): Promise<boolean> {
  if (availabilityCache !== null && !force) return availabilityCache;
  try {
    await execFileAsync(env.FFMPEG_PATH, ['-version'], { timeout: 15_000 });
    await execFileAsync(env.FFPROBE_PATH, ['-version'], { timeout: 15_000 });
    availabilityCache = true;
  } catch {
    availabilityCache = false;
  }
  return availabilityCache;
}

// ── ffprobe ────────────────────────────────────────────────────────────────

interface FfprobeStream {
  codec_type?: string;
  width?: number;
  height?: number;
  duration?: string;
  r_frame_rate?: string;
  avg_frame_rate?: string;
  tags?: Record<string, string>;
  side_data_list?: { rotation?: number }[];
}

interface FfprobeOutput {
  streams?: FfprobeStream[];
  format?: { duration?: string; bit_rate?: string };
}

function parseFraction(value: string | undefined): number {
  if (!value) return 0;
  const [num, den] = value.split('/');
  const n = Number(num);
  const d = den === undefined ? 1 : Number(den);
  if (!Number.isFinite(n) || !Number.isFinite(d) || d === 0) return 0;
  return n / d;
}

function normalizeRotation(stream: FfprobeStream | undefined): number {
  if (!stream) return 0;
  let raw = 0;
  const tag = stream.tags?.rotate;
  if (tag !== undefined && Number.isFinite(Number(tag))) raw = Number(tag);
  const sideData = stream.side_data_list?.find((s) => typeof s.rotation === 'number');
  if (sideData?.rotation !== undefined) raw = sideData.rotation;
  const normalized = ((Math.round(raw) % 360) + 360) % 360;
  // On ne garde que les multiples de 90 (les autres valeurs ne changent pas les dimensions).
  return normalized % 90 === 0 ? normalized : 0;
}

/** Analyse un fichier local et renvoie ses caractéristiques média. */
export async function probe(filePath: string): Promise<ProbeResult> {
  let stdout: string;
  try {
    const res = await execFileAsync(
      env.FFPROBE_PATH,
      ['-v', 'error', '-print_format', 'json', '-show_format', '-show_streams', filePath],
      { maxBuffer: 32 * 1024 * 1024, timeout: 120_000 },
    );
    stdout = res.stdout;
  } catch (err) {
    const message = err instanceof Error ? err.message : String(err);
    throw new Error(`ffprobe a échoué sur « ${path.basename(filePath)} » : ${message}`);
  }

  let parsed: FfprobeOutput;
  try {
    parsed = JSON.parse(stdout) as FfprobeOutput;
  } catch {
    throw new Error('Sortie ffprobe illisible (JSON invalide)');
  }

  const streams = parsed.streams ?? [];
  const video = streams.find((s) => s.codec_type === 'video');
  const hasAudio = streams.some((s) => s.codec_type === 'audio');

  const durationSec =
    Number(parsed.format?.duration ?? video?.duration ?? 0) || 0;
  const bitrate = Number(parsed.format?.bit_rate ?? 0) || 0;
  const fps = parseFraction(video?.r_frame_rate) || parseFraction(video?.avg_frame_rate);
  const rotation = normalizeRotation(video);

  let width = video?.width ?? 0;
  let height = video?.height ?? 0;
  // Une rotation de 90/270° inverse les dimensions à l'affichage : c'est cette
  // orientation-là qui compte pour détecter un Short (vertical).
  if (rotation === 90 || rotation === 270) [width, height] = [height, width];

  if (!video) throw new Error('Aucun flux vidéo détecté dans le fichier source');

  return {
    durationSec: Math.max(0, durationSec),
    width,
    height,
    bitrate,
    hasAudio,
    fps: Math.round(fps * 1000) / 1000,
    rotation,
  };
}

// ── Exécution de ffmpeg avec suivi de progression ──────────────────────────

interface RunOptions {
  /** Durée totale attendue, nécessaire pour convertir la progression en ratio. */
  durationSec?: number;
  onProgress?: ProgressCallback;
  /** Étiquette utilisée dans les messages d'erreur. */
  label?: string;
}

function parseOutTime(line: string): number | null {
  // Format : out_time=00:01:23.456789
  const m = /^out_time=(\d+):(\d{2}):(\d{2}(?:\.\d+)?)$/.exec(line);
  if (!m) return null;
  return Number(m[1]) * 3600 + Number(m[2]) * 60 + Number(m[3]);
}

/** Lance ffmpeg et résout quand le process se termine avec le code 0. */
function runFfmpeg(args: string[], opts: RunOptions = {}): Promise<void> {
  const globalArgs = ['-hide_banner', '-loglevel', 'error', '-nostdin'];
  if (opts.onProgress) globalArgs.push('-progress', 'pipe:1', '-nostats');

  return new Promise<void>((resolve, reject) => {
    const child = spawn(env.FFMPEG_PATH, [...globalArgs, ...args], {
      stdio: ['ignore', 'pipe', 'pipe'],
    });

    let stderrTail = '';
    let stdoutBuffer = '';

    child.stdout?.on('data', (chunk: Buffer) => {
      if (!opts.onProgress) return;
      stdoutBuffer += chunk.toString('utf8');
      const lines = stdoutBuffer.split('\n');
      stdoutBuffer = lines.pop() ?? '';
      for (const line of lines) {
        const trimmed = line.trim();
        if (trimmed === 'progress=end') {
          opts.onProgress(1);
          continue;
        }
        const seconds = parseOutTime(trimmed);
        if (seconds !== null && opts.durationSec && opts.durationSec > 0) {
          opts.onProgress(Math.max(0, Math.min(1, seconds / opts.durationSec)));
        }
      }
    });

    child.stderr?.on('data', (chunk: Buffer) => {
      stderrTail = (stderrTail + chunk.toString('utf8')).slice(-4000);
    });

    child.on('error', (err) => {
      reject(new Error(`Impossible de lancer ffmpeg (${env.FFMPEG_PATH}) : ${err.message}`));
    });

    child.on('close', (code) => {
      if (code === 0) {
        opts.onProgress?.(1);
        resolve();
        return;
      }
      const what = opts.label ? ` [${opts.label}]` : '';
      reject(new Error(`ffmpeg${what} a échoué (code ${code}) : ${stderrTail.trim() || 'aucun détail'}`));
    });
  });
}

// ── Calcul des dimensions ──────────────────────────────────────────────────

/** libx264 exige des dimensions paires (chroma 4:2:0). */
function toEven(n: number): number {
  return Math.max(2, Math.round(n / 2) * 2);
}

/**
 * Ajuste les dimensions de sortie en conservant le ratio.
 * `targetShortSide` est la hauteur nominale de la résolution (240, 360, 720…).
 * Pour une source verticale (Short), c'est la LARGEUR qui est contrainte :
 * un « 720p » vertical fait donc 720×1280 et non 405×720.
 * Jamais d'upscale : on ne dépasse pas la taille de la source.
 */
export function fitDimensions(
  srcWidth: number,
  srcHeight: number,
  targetShortSide: number,
): { width: number; height: number } {
  if (!srcWidth || !srcHeight || srcWidth <= 0 || srcHeight <= 0) {
    return { width: 0, height: 0 };
  }
  const portrait = srcHeight > srcWidth;
  let width: number;
  let height: number;
  if (portrait) {
    width = Math.min(srcWidth, targetShortSide);
    height = Math.round((width * srcHeight) / srcWidth);
  } else {
    height = Math.min(srcHeight, targetShortSide);
    width = Math.round((height * srcWidth) / srcHeight);
  }
  return { width: toEven(width), height: toEven(height) };
}

async function resolveMeta(input: string, source?: SourceMeta): Promise<SourceMeta> {
  if (source) return source;
  const p = await probe(input);
  return { width: p.width, height: p.height, durationSec: p.durationSec, hasAudio: p.hasAudio };
}

function videoEncodeArgs(bitrateKbps: number, crf: number): string[] {
  return [
    '-c:v', 'libx264',
    '-preset', 'veryfast',
    '-profile:v', 'main',
    '-pix_fmt', 'yuv420p',
    '-crf', String(crf),
    '-maxrate', `${bitrateKbps}k`,
    '-bufsize', `${bitrateKbps * 2}k`,
  ];
}

// ── HLS (une résolution) ───────────────────────────────────────────────────

/**
 * Transcode UNE résolution en HLS : `index.m3u8` + segments `seg_XXXX.ts`
 * dans `outDir`. `onProgress` reçoit un ratio 0→1.
 */
export async function transcodeToHls(
  input: string,
  outDir: string,
  rendition: Rendition,
  onProgress?: ProgressCallback,
  source?: SourceMeta,
): Promise<HlsVariantResult> {
  await fs.mkdir(outDir, { recursive: true });
  const meta = await resolveMeta(input, source);
  const { width, height } = fitDimensions(meta.width, meta.height, rendition.height);

  const args = ['-y', '-i', input];
  if (width > 0 && height > 0) args.push('-vf', `scale=${width}:${height}`);
  args.push(
    ...videoEncodeArgs(rendition.bitrateKbps, 21),
    // GOP fixe de 2 s (48 images à 24 fps) : indispensable pour que les
    // segments HLS de toutes les variantes soient alignés.
    '-g', '48',
    '-keyint_min', '48',
    '-sc_threshold', '0',
  );
  if (meta.hasAudio) args.push('-c:a', 'aac', '-b:a', `${rendition.audioKbps}k`, '-ac', '2');
  else args.push('-an');
  args.push(
    '-f', 'hls',
    '-hls_time', '4',
    '-hls_playlist_type', 'vod',
    '-hls_flags', 'independent_segments',
    '-hls_segment_filename', path.join(outDir, 'seg_%04d.ts'),
    path.join(outDir, 'index.m3u8'),
  );

  await runFfmpeg(args, {
    durationSec: meta.durationSec,
    onProgress,
    label: `hls ${rendition.label}`,
  });

  const entries = await fs.readdir(outDir);
  const segmentFiles = entries
    .filter((f) => f.endsWith('.ts'))
    .sort()
    .map((f) => path.join(outDir, f));

  let sizeBytes = 0;
  for (const file of segmentFiles) {
    const stat = await fs.stat(file);
    sizeBytes += stat.size;
  }

  const playlistFile = path.join(outDir, 'index.m3u8');
  await fs.access(playlistFile).catch(() => {
    throw new Error(`Playlist HLS manquante pour la variante ${rendition.label}`);
  });

  return {
    label: rendition.label,
    width: width || meta.width,
    height: height || meta.height,
    bitrateKbps: rendition.bitrateKbps,
    audioKbps: rendition.audioKbps,
    playlistFile,
    segmentFiles,
    sizeBytes,
  };
}

// ── MP4 progressif (repli navigateurs sans HLS) ────────────────────────────

/** Transcode un MP4 unique (`+faststart`) pour les lecteurs sans support HLS. */
export async function transcodeToMp4(
  input: string,
  outPath: string,
  rendition: Rendition,
  onProgress?: ProgressCallback,
  source?: SourceMeta,
): Promise<{ width: number; height: number; sizeBytes: number }> {
  await fs.mkdir(path.dirname(outPath), { recursive: true });
  const meta = await resolveMeta(input, source);
  const { width, height } = fitDimensions(meta.width, meta.height, rendition.height);

  const args = ['-y', '-i', input];
  if (width > 0 && height > 0) args.push('-vf', `scale=${width}:${height}`);
  args.push(...videoEncodeArgs(rendition.bitrateKbps, 23));
  if (meta.hasAudio) args.push('-c:a', 'aac', '-b:a', `${rendition.audioKbps}k`, '-ac', '2');
  else args.push('-an');
  args.push('-movflags', '+faststart', '-f', 'mp4', outPath);

  await runFfmpeg(args, {
    durationSec: meta.durationSec,
    onProgress,
    label: `mp4 ${rendition.label}`,
  });

  const stat = await fs.stat(outPath);
  return { width: width || meta.width, height: height || meta.height, sizeBytes: stat.size };
}

// ── Miniatures ─────────────────────────────────────────────────────────────

/**
 * Extrait une image JPEG par timestamp (secondes).
 * Renvoie les chemins des fichiers réellement produits.
 */
export async function extractThumbnails(
  input: string,
  outDir: string,
  timestamps: number[],
  source?: SourceMeta,
): Promise<string[]> {
  await fs.mkdir(outDir, { recursive: true });
  const meta = await resolveMeta(input, source);
  const { width, height } = fitDimensions(meta.width, meta.height, 720);

  const produced: string[] = [];
  for (let i = 0; i < timestamps.length; i++) {
    const at = Math.max(0, timestamps[i]);
    const outPath = path.join(outDir, `thumb_${i}.jpg`);
    const args = ['-y', '-ss', at.toFixed(3), '-i', input, '-frames:v', '1', '-q:v', '2'];
    if (width > 0 && height > 0) args.push('-vf', `scale=${width}:${height}`);
    args.push('-f', 'image2', outPath);
    try {
      await runFfmpeg(args, { label: `miniature ${i}` });
      await fs.access(outPath);
      produced.push(outPath);
    } catch {
      // Un timestamp au-delà de la fin (fichier tronqué) ne doit pas tout casser.
    }
  }
  return produced;
}

// ── Clip de survol (hover preview) ─────────────────────────────────────────

/**
 * Extrait un MP4 MUET de quelques secondes (480p max) joué au survol de la
 * miniature, façon YouTube.
 */
export async function makePreviewClip(
  input: string,
  outPath: string,
  startSec: number,
  durationSec: number,
  source?: SourceMeta,
): Promise<string> {
  await fs.mkdir(path.dirname(outPath), { recursive: true });
  const meta = await resolveMeta(input, source);
  const { width, height } = fitDimensions(meta.width, meta.height, 480);
  const clipDuration = Math.max(1, Math.min(durationSec, 10));

  const args = ['-y', '-ss', Math.max(0, startSec).toFixed(3), '-i', input, '-t', clipDuration.toFixed(3)];
  if (width > 0 && height > 0) args.push('-vf', `scale=${width}:${height}`);
  args.push(
    '-an', // clip muet
    '-c:v', 'libx264',
    '-preset', 'veryfast',
    '-profile:v', 'main',
    '-pix_fmt', 'yuv420p',
    '-crf', '28',
    '-movflags', '+faststart',
    '-f', 'mp4',
    outPath,
  );

  await runFfmpeg(args, { label: 'clip de survol' });
  return outPath;
}

// ── Planche de vignettes (scrub sur la barre de progression) ───────────────

/**
 * Génère une planche (sprite sheet) de 10 colonnes utilisée par le lecteur
 * pour l'aperçu au survol de la barre de progression.
 */
export async function makeSpriteSheet(
  input: string,
  outPath: string,
  durationSec: number,
  source?: SourceMeta,
): Promise<SpriteSheetResult> {
  await fs.mkdir(path.dirname(outPath), { recursive: true });
  const meta = await resolveMeta(input, source);
  const tile = fitDimensions(meta.width, meta.height, 90);
  const tileWidth = tile.width || 160;
  const tileHeight = tile.height || 90;

  const columns = 10;
  const safeDuration = durationSec > 0 ? durationSec : meta.durationSec;
  const count = Math.max(1, Math.min(100, Math.floor(safeDuration)));
  const rows = Math.ceil(count / columns);
  const intervalSec = safeDuration > 0 ? safeDuration / count : 1;

  const filters = [
    `fps=${(1 / Math.max(intervalSec, 0.04)).toFixed(6)}`,
    `scale=${tileWidth}:${tileHeight}`,
    `tile=${columns}x${rows}`,
  ].join(',');

  await runFfmpeg(
    ['-y', '-i', input, '-vf', filters, '-frames:v', '1', '-q:v', '4', '-an', '-f', 'image2', outPath],
    { label: 'sprite sheet' },
  );

  return { outPath, columns, rows, tileWidth, tileHeight, intervalSec, count };
}
