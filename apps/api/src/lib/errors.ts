import type { FastifyReply } from 'fastify';
import { ZodError } from 'zod';

/**
 * Erreur applicative typée. Toute route DOIT lever une `AppError`
 * plutôt que de construire une réponse d'erreur à la main.
 */
export class AppError extends Error {
  constructor(
    public statusCode: number,
    public code: string,
    message: string,
    public details?: Record<string, string[]>,
  ) {
    super(message);
    this.name = 'AppError';
  }
}

export const badRequest = (msg = 'Requête invalide', details?: Record<string, string[]>) =>
  new AppError(400, 'BAD_REQUEST', msg, details);

export const unauthorized = (msg = 'Authentification requise') =>
  new AppError(401, 'UNAUTHORIZED', msg);

export const forbidden = (msg = 'Accès refusé') => new AppError(403, 'FORBIDDEN', msg);

export const notFound = (msg = 'Ressource introuvable') => new AppError(404, 'NOT_FOUND', msg);

export const conflict = (msg = 'Conflit', details?: Record<string, string[]>) =>
  new AppError(409, 'CONFLICT', msg, details);

export const tooManyRequests = (msg = 'Trop de requêtes') =>
  new AppError(429, 'TOO_MANY_REQUESTS', msg);

export const internal = (msg = 'Erreur interne') => new AppError(500, 'INTERNAL_ERROR', msg);

/** Convertit une ZodError en AppError 422 avec le détail par champ. */
export function fromZodError(err: ZodError): AppError {
  const details: Record<string, string[]> = {};
  for (const issue of err.errors) {
    const key = issue.path.join('.') || '_';
    (details[key] ??= []).push(issue.message);
  }
  return new AppError(422, 'VALIDATION_ERROR', 'Données invalides', details);
}

export function sendError(reply: FastifyReply, err: unknown) {
  if (err instanceof ZodError) {
    const appErr = fromZodError(err);
    return reply.status(appErr.statusCode).send({
      error: { code: appErr.code, message: appErr.message, details: appErr.details },
    });
  }
  if (err instanceof AppError) {
    return reply.status(err.statusCode).send({
      error: { code: err.code, message: err.message, details: err.details },
    });
  }
  reply.log.error({ err }, 'Erreur non gérée');
  return reply.status(500).send({
    error: { code: 'INTERNAL_ERROR', message: 'Erreur interne du serveur' },
  });
}
