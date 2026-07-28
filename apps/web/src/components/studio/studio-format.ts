/**
 * Helpers d'affichage propres au Studio (français, unités YouTube Studio).
 */

const NUMBER_FR = new Intl.NumberFormat('fr-FR');
const DECIMAL_FR = new Intl.NumberFormat('fr-FR', { maximumFractionDigits: 1 });
const CURRENCY_FR = new Intl.NumberFormat('fr-FR', {
  style: 'currency',
  currency: 'EUR',
  maximumFractionDigits: 2,
});

/** 1234567 -> « 1 234 567 » (chiffres exacts : les tableaux ne compactent pas). */
export function formatNumber(value: number): string {
  return NUMBER_FR.format(Math.round(value));
}

/** 12.3456 -> « 12,3 » */
export function formatDecimal(value: number): string {
  return DECIMAL_FR.format(value);
}

/** 4.21 (déjà en pourcentage) -> « 4,2 % ». */
export function formatPercent(value: number): string {
  return `${DECIMAL_FR.format(value)} %`;
}

/**
 * L'API renvoie `ctr`, `avgWatchPct` et `avgViewPct` en RATIO 0..1
 * (cf. `analytics.service.ts` et `analytics.worker.ts`), alors que les
 * répartitions (`trafficSources`, `devices`, `retention`…) sont déjà en 0..100.
 * Ce helper explicite la conversion pour éviter toute confusion.
 */
export function formatRatioAsPercent(ratio: number): string {
  return formatPercent(ratio * 100);
}

/** 12.5 -> « 12,5 h » */
export function formatHours(hours: number): string {
  return `${DECIMAL_FR.format(hours)} h`;
}

export function formatCurrency(value: number): string {
  return CURRENCY_FR.format(value);
}

/** Durée moyenne de visionnage : 95 -> « 1:35 ». */
export function formatClock(totalSeconds: number): string {
  const s = Math.max(0, Math.round(totalSeconds));
  const h = Math.floor(s / 3600);
  const m = Math.floor((s % 3600) / 60);
  const sec = s % 60;
  const pad = (v: number) => v.toString().padStart(2, '0');
  return h > 0 ? `${h}:${pad(m)}:${pad(sec)}` : `${m}:${pad(sec)}`;
}

/** « 4 mars » — axes de graphiques. */
const AXIS_DATE = new Intl.DateTimeFormat('fr-FR', { day: 'numeric', month: 'short' });
/** « lundi 4 mars 2024 » — infobulles. */
const FULL_DATE = new Intl.DateTimeFormat('fr-FR', {
  weekday: 'long',
  day: 'numeric',
  month: 'long',
  year: 'numeric',
});
/** « 4 mars 2024 » — colonnes de tableau. */
const SHORT_DATE = new Intl.DateTimeFormat('fr-FR', {
  day: 'numeric',
  month: 'short',
  year: 'numeric',
});
/** « 4 mars, 14:05 » — publication programmée. */
const DATE_TIME = new Intl.DateTimeFormat('fr-FR', {
  day: 'numeric',
  month: 'short',
  hour: '2-digit',
  minute: '2-digit',
});
/** « 14 h » — histogramme horaire. */
const HOUR = new Intl.DateTimeFormat('fr-FR', { hour: '2-digit' });

function toDate(iso: string): Date | null {
  // Les séries journalières arrivent en `YYYY-MM-DD` : on force le fuseau local
  // pour éviter le décalage d'un jour observé avec un parsing UTC.
  const date = /^\d{4}-\d{2}-\d{2}$/.test(iso) ? new Date(`${iso}T00:00:00`) : new Date(iso);
  return Number.isNaN(date.getTime()) ? null : date;
}

export function formatAxisDate(iso: string): string {
  const date = toDate(iso);
  return date ? AXIS_DATE.format(date) : iso;
}

export function formatFullDate(iso: string): string {
  const date = toDate(iso);
  return date ? FULL_DATE.format(date) : iso;
}

export function formatShortDate(iso: string): string {
  const date = toDate(iso);
  return date ? SHORT_DATE.format(date) : iso;
}

export function formatDateTime(iso: string): string {
  const date = toDate(iso);
  return date ? DATE_TIME.format(date) : iso;
}

export function formatHour(iso: string): string {
  const date = toDate(iso);
  return date ? HOUR.format(date) : iso;
}

/** Valeur d'un `<input type="datetime-local">` à partir d'une date ISO. */
export function toDateTimeLocalValue(iso: string | null | undefined): string {
  if (!iso) return '';
  const date = new Date(iso);
  if (Number.isNaN(date.getTime())) return '';
  const pad = (v: number) => v.toString().padStart(2, '0');
  return (
    `${date.getFullYear()}-${pad(date.getMonth() + 1)}-${pad(date.getDate())}` +
    `T${pad(date.getHours())}:${pad(date.getMinutes())}`
  );
}

/** Inverse de `toDateTimeLocalValue` : renvoie une date ISO complète (UTC). */
export function fromDateTimeLocalValue(value: string): string | null {
  if (!value) return null;
  const date = new Date(value);
  return Number.isNaN(date.getTime()) ? null : date.toISOString();
}

/** « 1:35 » saisi dans l'éditeur de chapitres -> 95 secondes. */
export function parseChapterTime(raw: string): number | null {
  const trimmed = raw.trim();
  if (!/^(?:\d{1,2}:)?\d{1,3}:\d{2}$|^\d+$/.test(trimmed)) return null;
  if (/^\d+$/.test(trimmed)) return Number(trimmed);
  const parts = trimmed.split(':').map(Number);
  if (parts.some((p) => !Number.isFinite(p))) return null;
  return parts.length === 3
    ? parts[0] * 3600 + parts[1] * 60 + parts[2]
    : parts[0] * 60 + parts[1];
}

/** Tronque proprement une description dans un tableau. */
export function truncate(text: string, max: number): string {
  const clean = text.replace(/\s+/g, ' ').trim();
  return clean.length > max ? `${clean.slice(0, max - 1)}…` : clean;
}
