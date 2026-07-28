import { buildServer } from './server.js';
import { env } from './config/env.js';
import { closeRedis } from './lib/redis.js';
import { closeQueues } from './lib/queue.js';
import { prisma } from '@kelvyntube/db';

async function main() {
  const app = await buildServer();

  await app.listen({ port: env.API_PORT, host: env.API_HOST });

  app.log.info(`🎬 API Kelvyn Tube prête sur ${env.API_PUBLIC_URL}`);

  const shutdown = async (signal: string) => {
    app.log.info(`${signal} reçu — arrêt en cours…`);
    await app.close();
    await closeQueues();
    await closeRedis();
    await prisma.$disconnect();
    process.exit(0);
  };

  process.on('SIGINT', () => void shutdown('SIGINT'));
  process.on('SIGTERM', () => void shutdown('SIGTERM'));
}

main().catch((err) => {
  console.error('Échec du démarrage de l\'API :', err);
  process.exit(1);
});
