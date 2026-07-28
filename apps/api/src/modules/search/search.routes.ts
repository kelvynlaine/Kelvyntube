import type { FastifyInstance } from 'fastify';
import { ROUTES, searchSchema, suggestSchema } from '@kelvyntube/shared';
import type { SearchResultsDTO, SearchSuggestionDTO } from '@kelvyntube/shared';
import { runSearch, getSuggestions } from './search.service.js';
import { registerTagRoutes } from './tags.routes.js';
import { ensureIndexes } from './meili.js';

/**
 * ═══════════════════════════════════════════════════════════════════════════
 *  MODULE RECHERCHE — /search, /search/suggest et /tags/*
 *  Aucune de ces routes n'exige d'authentification : `optionalAuth` sert
 *  uniquement à rattacher la requête à l'utilisateur pour l'autocomplétion.
 * ═══════════════════════════════════════════════════════════════════════════
 */
export async function registerSearchRoutes(app: FastifyInstance) {
  // Configuration des index Meilisearch : volontairement non bloquante.
  // Si Meilisearch est absent, l'API démarre quand même (repli PostgreSQL).
  void ensureIndexes().then((ok) => {
    if (ok) app.log.info('[search] index Meilisearch prêts');
  });

  // ── GET /search ─────────────────────────────────────────────────────────
  app.get(
    ROUTES.search.query,
    { preHandler: app.optionalAuth },
    async (req): Promise<SearchResultsDTO> => {
      const input = searchSchema.parse(req.query);
      return runSearch(input, req.user?.sub ?? null);
    },
  );

  // ── GET /search/suggest ─────────────────────────────────────────────────
  app.get(ROUTES.search.suggest, async (req): Promise<SearchSuggestionDTO[]> => {
    const { q } = suggestSchema.parse(req.query);
    return getSuggestions(q);
  });

  // ── /tags/* ─────────────────────────────────────────────────────────────
  await registerTagRoutes(app);
}
