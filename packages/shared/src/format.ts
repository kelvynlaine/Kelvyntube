/**
 * Helpers d'affichage partagés (formats YouTube).
 */

/** 1 234 567 -> "1,2 M" */
export function formatCompactNumber(n: number, locale = 'fr-FR'): string {
  return new Intl.NumberFormat(locale, {
    notation: 'compact',
    maximumFractionDigits: 1,
  }).format(n);
}

/** 1234 -> "1 234 vues" */
export function formatViews(n: number, locale = 'fr-FR'): string {
  const label = n <= 1 ? 'vue' : 'vues';
  return `${formatCompactNumber(n, locale)} ${label}`;
}

/** 3725 -> "1:02:05" ; 125 -> "2:05" */
export function formatDuration(totalSeconds: number): string {
  const s = Math.max(0, Math.floor(totalSeconds));
  const hours = Math.floor(s / 3600);
  const minutes = Math.floor((s % 3600) / 60);
  const seconds = s % 60;
  const pad = (v: number) => v.toString().padStart(2, '0');
  return hours > 0
    ? `${hours}:${pad(minutes)}:${pad(seconds)}`
    : `${minutes}:${pad(seconds)}`;
}

/** Date ISO -> "il y a 3 jours" */
export function formatRelativeTime(iso: string | Date, locale = 'fr-FR'): string {
  const date = typeof iso === 'string' ? new Date(iso) : iso;
  const diffMs = date.getTime() - Date.now();
  const rtf = new Intl.RelativeTimeFormat(locale, { numeric: 'auto' });
  const units: [Intl.RelativeTimeFormatUnit, number][] = [
    ['year', 1000 * 60 * 60 * 24 * 365],
    ['month', 1000 * 60 * 60 * 24 * 30],
    ['week', 1000 * 60 * 60 * 24 * 7],
    ['day', 1000 * 60 * 60 * 24],
    ['hour', 1000 * 60 * 60],
    ['minute', 1000 * 60],
    ['second', 1000],
  ];
  for (const [unit, ms] of units) {
    if (Math.abs(diffMs) >= ms || unit === 'second') {
      return rtf.format(Math.round(diffMs / ms), unit);
    }
  }
  return '';
}

/** "1:23" ou "01:02:03" présent dans une description -> secondes. */
export function parseTimestamp(text: string): number | null {
  const m = text.match(/^(?:(\d{1,2}):)?(\d{1,2}):(\d{2})$/);
  if (!m) return null;
  const [, h, mm, ss] = m;
  return (Number(h ?? 0) * 3600) + (Number(mm) * 60) + Number(ss);
}

/** Extrait les hashtags (#tag) d'un texte, normalisés en minuscules. */
export function extractHashtags(text: string): string[] {
  const matches = text.matchAll(/#([\p{L}\p{N}_]{2,40})/gu);
  const out = new Set<string>();
  for (const m of matches) out.add(m[1].toLowerCase());
  return [...out];
}

/** Extrait les mentions @handle d'un texte. */
export function extractMentions(text: string): string[] {
  const matches = text.matchAll(/@([a-zA-Z0-9._-]{3,30})/g);
  const out = new Set<string>();
  for (const m of matches) out.add(m[1]);
  return [...out];
}

/** Normalise un tag saisi par l'utilisateur ("#Mon Tag !" -> "montag"). */
export function normalizeTag(raw: string): string {
  return raw
    .trim()
    .replace(/^#/, '')
    .toLowerCase()
    .normalize('NFD')
    .replace(/[̀-ͯ]/g, '')
    .replace(/[^a-z0-9_]/g, '')
    .slice(0, 40);
}
