/**
 * ═══════════════════════════════════════════════════════════════════════════
 *  MODÉRATION DES COMMENTAIRES
 *  - mots bloqués configurés par le créateur (`Channel.blockedWords`)
 *  - petite heuristique anti-spam intégrée (liens répétés, cris en majuscules)
 *
 *  Règle de comparaison : minuscules, sans accents, sur des MOTS ENTIERS.
 *  → « assez » ne déclenche pas le mot bloqué « ass », « CON » ne déclenche
 *    pas sur « contact ».
 * ═══════════════════════════════════════════════════════════════════════════
 */

export interface ModerationVerdict {
  /** false = le commentaire est refusé (422). */
  allowed: boolean;
  /** Mot bloqué de la chaîne qui a déclenché le refus. */
  matchedWord?: string;
  /**
   * true = le commentaire passe mais est signalé « en attente de relecture » :
   * on écrit un `ModerationLog` HELD_FOR_REVIEW, le créateur le retrouve dans
   * l'onglet Studio (filtre `held`) et décide de le garder ou de le supprimer.
   */
  held?: boolean;
  /** Motif lisible, journalisé dans `ModerationLog.reason`. */
  reason?: string;
}

/** Minuscules + suppression des diacritiques (é -> e, ç -> c…). */
export function normalizeText(text: string): string {
  return text
    .normalize('NFD')
    .replace(/[\u0300-\u036f]/g, '')
    .toLowerCase();
}

/** Découpe le texte normalisé en mots (lettres/chiffres Unicode uniquement). */
function tokenize(text: string): string[] {
  return normalizeText(text).match(/[\p{L}\p{N}]+/gu) ?? [];
}

/** Le tableau `needle` apparaît-il comme sous-séquence contiguë de `haystack` ? */
function containsSequence(haystack: string[], needle: string[]): boolean {
  if (needle.length === 0 || needle.length > haystack.length) return false;
  for (let i = 0; i + needle.length <= haystack.length; i += 1) {
    let ok = true;
    for (let j = 0; j < needle.length; j += 1) {
      if (haystack[i + j] !== needle[j]) {
        ok = false;
        break;
      }
    }
    if (ok) return true;
  }
  return false;
}

/**
 * Petite liste anti-spam intégrée (indépendante de la chaîne).
 * Ces motifs ne REFUSENT jamais : ils mettent en attente.
 */
const SPAM_PATTERNS: { pattern: RegExp; reason: string }[] = [
  { pattern: /\bsub\s*4\s*sub\b/i, reason: 'Échange d’abonnements (sub4sub)' },
  { pattern: /\bab+onne?\s*[- ]?\s*toi\b.*\bje\s*m.?ab+onne\b/i, reason: 'Échange d’abonnements' },
  { pattern: /\b(crypto|bitcoin|btc|eth)\b.{0,20}\b(gratuit|free|offert|giveaway)\b/i, reason: 'Spam crypto' },
  { pattern: /\bfree\s+(robux|v-?bucks|gift\s*cards?)\b/i, reason: 'Spam « cadeaux gratuits »' },
  { pattern: /\b(t\.me|wa\.me|telegram|whats?app)\b.{0,30}\+?\d[\d\s.-]{7,}/i, reason: 'Démarchage par messagerie' },
  { pattern: /\bgagne[rz]?\s+(de\s+l.?argent|\d+\s*(€|\$|euros?|dollars?))\b/i, reason: 'Promesse de gains' },
];

const URL_RE = /https?:\/\/[^\s<>"']+|(?:^|\s)(?:www\.)[^\s<>"']+/gi;

/** Domaine (sans www.) d'une URL brute, ou null si illisible. */
function domainOf(rawUrl: string): string | null {
  const trimmed = rawUrl.trim();
  const withProtocol = /^https?:\/\//i.test(trimmed) ? trimmed : `http://${trimmed}`;
  try {
    return new URL(withProtocol).hostname.replace(/^www\./i, '').toLowerCase();
  } catch {
    return null;
  }
}

/** Renvoie un motif de mise en attente, ou null si le texte semble sain. */
export function detectSpam(text: string): string | null {
  // 1. Liens répétés : 3 liens ou plus, ou 2 fois le même domaine.
  const urls = text.match(URL_RE) ?? [];
  if (urls.length >= 3) return 'Trop de liens';
  if (urls.length >= 2) {
    const domains = urls.map(domainOf).filter((d): d is string => d !== null);
    if (new Set(domains).size < domains.length) return 'Lien répété';
  }

  // 2. Texte « crié » : plus de 40 caractères et quasiment tout en majuscules.
  const trimmed = text.trim();
  if (trimmed.length > 40) {
    const letters = trimmed.match(/\p{L}/gu) ?? [];
    if (letters.length >= 20) {
      const upper = letters.filter((c) => c === c.toUpperCase() && c !== c.toLowerCase()).length;
      if (upper / letters.length >= 0.9) return 'Texte entièrement en majuscules';
    }
  }

  // 3. Motifs de spam connus.
  for (const { pattern, reason } of SPAM_PATTERNS) {
    if (pattern.test(text)) return reason;
  }

  return null;
}

/**
 * Vérifie un commentaire contre les mots bloqués de la chaîne puis
 * contre l'anti-spam intégré.
 */
export function checkComment(
  text: string,
  channel: { blockedWords?: string[] | null },
): ModerationVerdict {
  const tokens = tokenize(text);

  for (const raw of channel.blockedWords ?? []) {
    const needle = tokenize(raw);
    if (needle.length === 0) continue;
    if (containsSequence(tokens, needle)) {
      return {
        allowed: false,
        matchedWord: raw,
        reason: `Mot bloqué par la chaîne : « ${raw} »`,
      };
    }
  }

  const spam = detectSpam(text);
  if (spam) return { allowed: true, held: true, reason: spam };

  return { allowed: true };
}
