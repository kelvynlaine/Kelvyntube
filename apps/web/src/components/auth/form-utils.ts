'use client';

import type { z } from 'zod';
import { ApiClientError } from '@/lib/api';

/**
 * ═══════════════════════════════════════════════════════════════════════════
 *  OUTILS DE FORMULAIRE — validation Zod partagée + erreurs serveur
 *  Les schémas viennent tous de `@kelvyntube/shared` : le client valide
 *  exactement ce que l'API valide.
 * ═══════════════════════════════════════════════════════════════════════════
 */

/** Erreurs de formulaire : un message par champ + un message global. */
export interface FormErrors {
  fields: Record<string, string>;
  global?: string;
}

export const NO_ERRORS: FormErrors = { fields: {} };

/** Aplati un `ZodError` en un message par champ. */
export function zodFieldErrors(error: z.ZodError): Record<string, string> {
  const flat = error.flatten().fieldErrors;
  const result: Record<string, string> = {};
  for (const [field, messages] of Object.entries(flat)) {
    const first = messages?.[0];
    if (first) result[field] = first;
  }
  return result;
}

/**
 * Convertit une erreur d'API en erreurs de formulaire.
 * `ApiClientError.fieldError(champ)` alimente le bon champ ; le reste part
 * dans le message global.
 */
export function apiFormErrors(error: unknown, fields: readonly string[]): FormErrors {
  if (!(error instanceof ApiClientError)) {
    return { fields: {}, global: 'Une erreur est survenue. Réessaie dans un instant.' };
  }

  const mapped: Record<string, string> = {};
  for (const field of fields) {
    const message = error.fieldError(field);
    if (message) mapped[field] = message;
  }

  // Si aucun champ n'a été reconnu, on affiche le message général.
  return {
    fields: mapped,
    global: Object.keys(mapped).length > 0 ? undefined : error.message,
  };
}

/**
 * Nettoie un paramètre `?next=` : seules les URL internes sont acceptées.
 * Bloque les redirections ouvertes (`//evil.com`, `https://evil.com`).
 */
export function safeNextPath(raw: string | null | undefined, fallback: string): string {
  if (!raw) return fallback;
  let value = raw;
  try {
    value = decodeURIComponent(raw);
  } catch {
    return fallback;
  }
  if (!value.startsWith('/') || value.startsWith('//') || value.startsWith('/\\')) {
    return fallback;
  }
  return value;
}

/** Valide un formulaire avec un schéma partagé ; renvoie les données ou les erreurs. */
export function validateWith<TSchema extends z.ZodTypeAny>(
  schema: TSchema,
  value: unknown,
): { ok: true; data: z.infer<TSchema> } | { ok: false; errors: FormErrors } {
  const parsed = schema.safeParse(value);
  if (parsed.success) return { ok: true, data: parsed.data };
  return { ok: false, errors: { fields: zodFieldErrors(parsed.error) } };
}
