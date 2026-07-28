/**
 * ═══════════════════════════════════════════════════════════════════════════
 *  CARTE DE NAVIGATION DU FRONTEND
 *  Source de vérité unique des URLs de l'application.
 *  Toutes les pages et tous les composants DOIVENT passer par ces helpers —
 *  aucun chemin en dur.
 * ═══════════════════════════════════════════════════════════════════════════
 */

export const PATHS = {
  home: '/',
  shorts: '/shorts',
  short: (videoId: string) => `/shorts?v=${videoId}`,
  watch: (videoId: string, opts?: { list?: string; t?: number }) => {
    const params = new URLSearchParams({ v: videoId });
    if (opts?.list) params.set('list', opts.list);
    if (opts?.t) params.set('t', String(opts.t));
    return `/watch?${params.toString()}`;
  },

  subscriptions: '/abonnements',
  library: '/bibliotheque',
  history: '/historique',
  liked: '/likees',
  watchLater: '/a-regarder-plus-tard',
  playlists: '/playlists',
  playlist: (id: string) => `/playlist?list=${id}`,
  myVideos: '/mes-videos',

  trending: '/tendances',
  explore: '/explorer',
  category: (slug: string) => `/?category=${slug}`,
  hashtag: (tag: string) => `/hashtag/${encodeURIComponent(tag)}`,

  results: (q: string, filters?: Record<string, string | undefined>) => {
    const params = new URLSearchParams({ q });
    for (const [k, v] of Object.entries(filters ?? {})) {
      if (v && v !== 'any' && v !== 'all' && v !== 'relevance') params.set(k, v);
    }
    return `/resultats?${params.toString()}`;
  },

  /** Page de chaîne : `/@kelvyn` (le handle est stocké sans le @). */
  channel: (handle: string) => `/@${handle.replace(/^@/, '')}`,
  channelTab: (handle: string, tab: 'videos' | 'shorts' | 'playlists' | 'communaute' | 'a-propos') =>
    `/@${handle.replace(/^@/, '')}/${tab}`,

  // ── Kelvyn Studio ────────────────────────────────────────────────────────
  studio: '/studio',
  studioChannel: (channelId: string) => `/studio/${channelId}`,
  studioVideos: (channelId: string) => `/studio/${channelId}/videos`,
  studioVideo: (channelId: string, videoId: string) => `/studio/${channelId}/videos/${videoId}`,
  studioAnalytics: (channelId: string) => `/studio/${channelId}/analytics`,
  studioComments: (channelId: string) => `/studio/${channelId}/commentaires`,
  studioSubscribers: (channelId: string) => `/studio/${channelId}/abonnes`,
  studioBoost: (channelId: string) => `/studio/${channelId}/booster`,
  studioCustomize: (channelId: string) => `/studio/${channelId}/personnalisation`,
  studioUpload: (channelId: string) => `/studio/${channelId}/upload`,

  // ── Authentification ─────────────────────────────────────────────────────
  login: '/connexion',
  register: '/inscription',
  onboarding: '/bienvenue',
  oauthCallback: '/auth/callback',
  verifyEmail: '/verifier-email',
  forgotPassword: '/mot-de-passe/oubli',
  resetPassword: '/mot-de-passe/reinitialiser',

  settings: '/parametres',
} as const;

/** Extrait le handle d'un segment d'URL `@kelvyn` -> `kelvyn` (null si invalide). */
export function parseHandleSegment(segment: string): string | null {
  const decoded = decodeURIComponent(segment);
  if (!decoded.startsWith('@')) return null;
  const handle = decoded.slice(1);
  return /^[a-zA-Z0-9._-]{3,30}$/.test(handle) ? handle : null;
}
