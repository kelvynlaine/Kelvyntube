import type { AnalyticsRangeInput, TimeSeriesPointDTO } from '@kelvyntube/shared';

/**
 * ═══════════════════════════════════════════════════════════════════════════
 *  RÉSOLUTION DES PLAGES DE DATES DU STUDIO
 *
 *  Toutes les analytics raisonnent en UTC et en jours pleins :
 *   - `from` = 00:00:00.000 UTC du premier jour (borne INCLUSE)
 *   - `to`   = 23:59:59.999 UTC du dernier jour (borne INCLUSE)
 *   - `days` = la liste complète des clés « YYYY-MM-DD » de la plage, ce qui
 *              permet de combler les trous des séries temporelles (le frontend
 *              exige des courbes continues, sans jour manquant).
 *
 *  Les clés `fromKey` / `toKey` servent aux requêtes SQL sur les colonnes de
 *  type `date` (VideoStatDaily.date, ChannelStatDaily.date) : on les compare
 *  avec un cast explicite `${key}::date`, insensible au fuseau de la session
 *  PostgreSQL — contrairement à un paramètre `timestamptz`.
 * ═══════════════════════════════════════════════════════════════════════════
 */

const MS_PER_DAY = 86_400_000;

/** Garde-fou : même en « lifetime », on ne remonte jamais au-delà de 5 ans. */
export const MAX_RANGE_DAYS = 5 * 365;

/** Nombre de jours couverts par chaque preset (hors « lifetime »). */
const PRESET_DAYS: Record<'7d' | '28d' | '90d' | '365d', number> = {
  '7d': 7,
  '28d': 28,
  '90d': 90,
  '365d': 365,
};

export interface ResolvedRange {
  /** Borne basse incluse — minuit UTC. */
  from: Date;
  /** Borne haute incluse — 23:59:59.999 UTC. */
  to: Date;
  /** « YYYY-MM-DD » de la borne basse (pour les casts SQL `::date`). */
  fromKey: string;
  /** « YYYY-MM-DD » de la borne haute. */
  toKey: string;
  /** Toutes les clés « YYYY-MM-DD » de la plage, bornes incluses. */
  days: string[];
  /** Preset demandé (utile pour tracer / debug). */
  preset: AnalyticsRangeInput['preset'];
}

// ── Helpers de dates ───────────────────────────────────────────────────────

/** Date -> « YYYY-MM-DD » (toujours en UTC). */
export function dateKey(d: Date): string {
  return d.toISOString().slice(0, 10);
}

export function startOfUtcDay(d: Date): Date {
  const copy = new Date(d.getTime());
  copy.setUTCHours(0, 0, 0, 0);
  return copy;
}

export function endOfUtcDay(d: Date): Date {
  const copy = new Date(d.getTime());
  copy.setUTCHours(23, 59, 59, 999);
  return copy;
}

/** « YYYY-MM-DD » -> Date (minuit UTC), ou null si la chaîne est invalide. */
export function parseDayKey(key: string | undefined | null): Date | null {
  if (!key) return null;
  const parsed = new Date(`${key}T00:00:00.000Z`);
  return Number.isNaN(parsed.getTime()) ? null : parsed;
}

/** Liste des clés journalières entre deux bornes incluses. */
export function buildDayKeys(from: Date, to: Date): string[] {
  const days: string[] = [];
  const start = startOfUtcDay(from).getTime();
  const end = startOfUtcDay(to).getTime();
  for (let t = start; t <= end; t += MS_PER_DAY) {
    days.push(dateKey(new Date(t)));
  }
  return days;
}

// ── Résolution ─────────────────────────────────────────────────────────────

/**
 * Convertit l'entrée validée par `analyticsRangeSchema` en plage concrète.
 *
 * Priorité : `from` / `to` explicites > `preset`.
 * `since` sert d'ancre pour le preset « lifetime » (date de création de la
 * chaîne ou de la vidéo) ; à défaut on retombe sur le plafond de 5 ans.
 */
export function resolveRange(
  input: Partial<AnalyticsRangeInput> | undefined,
  since?: Date | null,
): ResolvedRange {
  const preset = input?.preset ?? '28d';
  const now = new Date();

  const explicitTo = parseDayKey(input?.to);
  const explicitFrom = parseDayKey(input?.from);

  let to = endOfUtcDay(explicitTo ?? now);
  let from: Date;

  if (explicitFrom) {
    from = startOfUtcDay(explicitFrom);
  } else if (preset === 'lifetime') {
    // « Depuis toujours » : on part de la création de la ressource.
    from = startOfUtcDay(since ?? new Date(to.getTime() - MAX_RANGE_DAYS * MS_PER_DAY));
  } else {
    // Le preset inclut le jour courant : 7d = aujourd'hui + les 6 jours précédents.
    const span = PRESET_DAYS[preset] ?? 28;
    from = startOfUtcDay(new Date(to.getTime() - (span - 1) * MS_PER_DAY));
  }

  // Bornes inversées par l'appelant : on les remet à l'endroit plutôt que d'échouer.
  if (from.getTime() > to.getTime()) {
    const swap = startOfUtcDay(to);
    to = endOfUtcDay(from);
    from = swap;
  }

  // Plafond de sécurité : une plage trop large ferait exploser les séries.
  const maxSpanMs = MAX_RANGE_DAYS * MS_PER_DAY;
  if (to.getTime() - from.getTime() > maxSpanMs) {
    from = startOfUtcDay(new Date(to.getTime() - maxSpanMs));
  }

  return {
    from,
    to,
    fromKey: dateKey(from),
    toKey: dateKey(to),
    days: buildDayKeys(from, to),
    preset,
  };
}

// ── Séries temporelles ─────────────────────────────────────────────────────

/** Arrondi « affichable » (2 décimales) pour les heures et les euros. */
export function round2(n: number): number {
  return Math.round(n * 100) / 100;
}

/**
 * Projette une map { « YYYY-MM-DD » -> valeur } sur TOUS les jours de la plage.
 * Les jours sans donnée valent 0 : c'est ce qui garantit des courbes continues
 * côté frontend (pas de trou, pas de `null`).
 */
export function fillDailySeries(
  values: Map<string, number>,
  days: string[],
): TimeSeriesPointDTO[] {
  return days.map((date) => ({ date, value: round2(values.get(date) ?? 0) }));
}
