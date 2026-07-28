/**
 * ═══════════════════════════════════════════════════════════════════════════
 *  HLS — génération du master playlist
 *
 *  Arborescence S3 produite par le worker de transcodage :
 *    videos/<id>/hls/master.m3u8         ← ce fichier
 *    videos/<id>/hls/<label>/index.m3u8  ← une playlist par résolution
 *    videos/<id>/hls/<label>/seg_0000.ts
 *
 *  Les URI du master sont donc RELATIVES (`720p/index.m3u8`) : le lecteur les
 *  résout par rapport au master, ce qui rend l'ensemble indépendant du domaine
 *  CDN utilisé.
 * ═══════════════════════════════════════════════════════════════════════════
 */

export const HLS_CONTENT_TYPE = 'application/vnd.apple.mpegurl';
export const TS_CONTENT_TYPE = 'video/mp2t';

/** Cache court pour les playlists (elles peuvent être régénérées), long pour les segments. */
export const PLAYLIST_CACHE_CONTROL = 'public, max-age=3600';
export const SEGMENT_CACHE_CONTROL = 'public, max-age=31536000, immutable';

export interface MasterVariantInput {
  /** "240p", "720p"… — sert de nom de dossier ET d'attribut NAME. */
  label: string;
  width: number;
  height: number;
  /** Débit vidéo cible en kbps. */
  bitrateKbps: number;
  /** Débit audio en kbps (0 si la source est muette). */
  audioKbps: number;
  /** Vrai si la variante contient une piste audio. */
  hasAudio?: boolean;
  /** URI relative ; par défaut `<label>/index.m3u8`. */
  uri?: string;
}

/**
 * Chaîne CODECS attendue par les lecteurs HLS.
 * H.264 High/Main profile + niveau déduit de la définition, AAC-LC pour l'audio.
 */
export function h264CodecString(width: number, height: number): string {
  const pixels = Math.max(0, width) * Math.max(0, height);
  // avc1.<profile_idc><constraints><level_idc> en hexadécimal — profil Main (0x4d).
  if (pixels <= 640 * 480) return 'avc1.4d401e'; // niveau 3.0
  if (pixels <= 1280 * 720) return 'avc1.4d401f'; // niveau 3.1
  if (pixels <= 1920 * 1080) return 'avc1.4d4028'; // niveau 4.0
  if (pixels <= 2560 * 1440) return 'avc1.4d4032'; // niveau 5.0
  return 'avc1.4d4033'; // niveau 5.1
}

/** Bande passante annoncée : débit vidéo + audio, avec ~10 % de marge de conteneur. */
function bandwidthBps(variant: MasterVariantInput): number {
  const audio = variant.hasAudio === false ? 0 : variant.audioKbps;
  return Math.round((variant.bitrateKbps + audio) * 1000 * 1.1);
}

/**
 * Construit le contenu du `master.m3u8` référençant toutes les variantes,
 * triées de la plus légère à la plus lourde (le lecteur démarre sur la première).
 */
export function buildMasterPlaylist(variants: MasterVariantInput[]): string {
  const sorted = [...variants].sort((a, b) => bandwidthBps(a) - bandwidthBps(b));

  const lines: string[] = ['#EXTM3U', '#EXT-X-VERSION:3', '#EXT-X-INDEPENDENT-SEGMENTS', ''];

  for (const variant of sorted) {
    const bandwidth = bandwidthBps(variant);
    const codecs = variant.hasAudio === false
      ? h264CodecString(variant.width, variant.height)
      : `${h264CodecString(variant.width, variant.height)},mp4a.40.2`;

    const attributes = [
      `BANDWIDTH=${bandwidth}`,
      `AVERAGE-BANDWIDTH=${Math.round(bandwidth / 1.1)}`,
      `RESOLUTION=${variant.width}x${variant.height}`,
      `CODECS="${codecs}"`,
      `NAME="${variant.label}"`,
    ].join(',');

    lines.push(`#EXT-X-STREAM-INF:${attributes}`);
    lines.push(variant.uri ?? `${variant.label}/index.m3u8`);
    lines.push('');
  }

  return `${lines.join('\n').trimEnd()}\n`;
}
