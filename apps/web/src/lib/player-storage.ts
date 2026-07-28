'use client';

/**
 * ═══════════════════════════════════════════════════════════════════════════
 *  PRÉFÉRENCES PERSISTÉES DU LECTEUR
 *  Volume, sourdine, vitesse, qualité préférée, langue de sous-titres et
 *  mode théâtre sont conservés dans `localStorage` d'une session à l'autre,
 *  comme sur YouTube.
 *  Toutes les fonctions sont sûres côté serveur (SSR) : elles retournent
 *  simplement les valeurs par défaut si `window` n'existe pas.
 * ═══════════════════════════════════════════════════════════════════════════
 */

/** Clé de stockage des préférences du lecteur. */
const PREFS_KEY = 'kt_player_prefs';

/** Clé de l'identifiant de session anonyme utilisé par le comptage de vues. */
export const SESSION_STORAGE_KEY = 'kt_session_id';

export interface PlayerPreferences {
  /** Volume normalisé 0 → 1. */
  volume: number;
  /** Son coupé. */
  muted: boolean;
  /** Vitesse de lecture (0.25 → 2). */
  playbackRate: number;
  /** Hauteur de qualité préférée (720, 1080…) ; `null` = automatique. */
  qualityHeight: number | null;
  /** Code langue des sous-titres actifs ; `null` = désactivés. */
  captionsLang: string | null;
  /** Mode théâtre (lecteur élargi). */
  theaterMode: boolean;
}

export const DEFAULT_PLAYER_PREFERENCES: PlayerPreferences = {
  volume: 1,
  muted: false,
  playbackRate: 1,
  qualityHeight: null,
  captionsLang: null,
  theaterMode: false,
};

/** Vitesses proposées dans le menu réglages. */
export const PLAYBACK_RATES = [0.25, 0.5, 0.75, 1, 1.25, 1.5, 1.75, 2] as const;

function isRecord(value: unknown): value is Record<string, unknown> {
  return typeof value === 'object' && value !== null;
}

/** Borne une valeur numérique dans [min, max]. */
export function clamp(value: number, min: number, max: number): number {
  return Math.min(max, Math.max(min, value));
}

/** Lit les préférences (fusionnées avec les valeurs par défaut). */
export function readPlayerPreferences(): PlayerPreferences {
  if (typeof window === 'undefined') return { ...DEFAULT_PLAYER_PREFERENCES };
  try {
    const raw = window.localStorage.getItem(PREFS_KEY);
    if (!raw) return { ...DEFAULT_PLAYER_PREFERENCES };
    const parsed: unknown = JSON.parse(raw);
    if (!isRecord(parsed)) return { ...DEFAULT_PLAYER_PREFERENCES };

    const volume =
      typeof parsed.volume === 'number' && Number.isFinite(parsed.volume)
        ? clamp(parsed.volume, 0, 1)
        : DEFAULT_PLAYER_PREFERENCES.volume;

    const playbackRate =
      typeof parsed.playbackRate === 'number' && Number.isFinite(parsed.playbackRate)
        ? clamp(parsed.playbackRate, 0.25, 2)
        : DEFAULT_PLAYER_PREFERENCES.playbackRate;

    return {
      volume,
      muted: typeof parsed.muted === 'boolean' ? parsed.muted : DEFAULT_PLAYER_PREFERENCES.muted,
      playbackRate,
      qualityHeight:
        typeof parsed.qualityHeight === 'number' && Number.isFinite(parsed.qualityHeight)
          ? parsed.qualityHeight
          : null,
      captionsLang: typeof parsed.captionsLang === 'string' ? parsed.captionsLang : null,
      theaterMode:
        typeof parsed.theaterMode === 'boolean'
          ? parsed.theaterMode
          : DEFAULT_PLAYER_PREFERENCES.theaterMode,
    };
  } catch {
    // Stockage indisponible (mode privé, quota) : on retombe sur les défauts.
    return { ...DEFAULT_PLAYER_PREFERENCES };
  }
}

/** Met à jour une partie des préférences sans écraser les autres. */
export function writePlayerPreferences(patch: Partial<PlayerPreferences>): void {
  if (typeof window === 'undefined') return;
  try {
    const next: PlayerPreferences = { ...readPlayerPreferences(), ...patch };
    window.localStorage.setItem(PREFS_KEY, JSON.stringify(next));
  } catch {
    /* écriture impossible : on ignore silencieusement */
  }
}

/** Génère un UUID v4 (avec repli si `crypto.randomUUID` est absent). */
function generateUuid(): string {
  if (typeof crypto !== 'undefined' && typeof crypto.randomUUID === 'function') {
    return crypto.randomUUID();
  }
  if (typeof crypto !== 'undefined' && typeof crypto.getRandomValues === 'function') {
    const bytes = crypto.getRandomValues(new Uint8Array(16));
    bytes[6] = (bytes[6] & 0x0f) | 0x40;
    bytes[8] = (bytes[8] & 0x3f) | 0x80;
    const hex = Array.from(bytes, (b) => b.toString(16).padStart(2, '0')).join('');
    return `${hex.slice(0, 8)}-${hex.slice(8, 12)}-${hex.slice(12, 16)}-${hex.slice(16, 20)}-${hex.slice(20)}`;
  }
  // Dernier recours (jamais atteint dans un navigateur moderne).
  return `kt-${Date.now().toString(16)}-${Math.random().toString(16).slice(2, 14)}`;
}

/**
 * Identifiant de session anonyme, stable entre les rechargements.
 * Le serveur s'en sert pour dédupliquer les vues (`watchHeartbeatSchema`
 * impose 8 à 64 caractères : un UUID en fait 36).
 */
export function getSessionId(): string {
  if (typeof window === 'undefined') return '';
  try {
    const existing = window.localStorage.getItem(SESSION_STORAGE_KEY);
    if (existing && existing.length >= 8 && existing.length <= 64) return existing;
    const created = generateUuid();
    window.localStorage.setItem(SESSION_STORAGE_KEY, created);
    return created;
  } catch {
    // localStorage inaccessible : session éphémère (valide pour cette page).
    return generateUuid();
  }
}
