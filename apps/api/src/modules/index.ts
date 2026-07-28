import type { FastifyInstance } from 'fastify';

/**
 * ═══════════════════════════════════════════════════════════════════════════
 *  REGISTRE DES MODULES
 *  Chaque module vit dans son propre dossier et exporte une unique fonction
 *  `register<Nom>Routes(app)`. Ce fichier est le seul point de couplage.
 * ═══════════════════════════════════════════════════════════════════════════
 */

import { registerAuthRoutes } from './auth/auth.routes.js';
import { registerChannelRoutes } from './channels/channels.routes.js';
import { registerUploadRoutes } from './upload/upload.routes.js';
import { registerVideoRoutes } from './videos/videos.routes.js';
import { registerViewRoutes } from './views/views.routes.js';
import { registerFeedRoutes } from './feed/feed.routes.js';
import { registerSocialRoutes } from './social/social.routes.js';
import { registerStudioRoutes } from './studio/studio.routes.js';
import { registerSearchRoutes } from './search/search.routes.js';
import { registerLibraryRoutes } from './library/library.routes.js';

export async function registerModules(app: FastifyInstance) {
  await registerAuthRoutes(app);
  await registerChannelRoutes(app);
  await registerUploadRoutes(app);
  await registerVideoRoutes(app);
  await registerViewRoutes(app);
  await registerFeedRoutes(app);
  await registerSocialRoutes(app);
  await registerStudioRoutes(app);
  await registerSearchRoutes(app);
  await registerLibraryRoutes(app);
}
