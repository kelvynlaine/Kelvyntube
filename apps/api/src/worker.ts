import { Worker, type Job } from 'bullmq';
import { QUEUES } from '@kelvyntube/shared';
import { env } from './config/env.js';
import { bullConnection, closeRedis } from './lib/redis.js';
import { analyticsQueue, closeQueues } from './lib/queue.js';
import { prisma } from '@kelvyntube/db';

/**
 * ═══════════════════════════════════════════════════════════════════════════
 *  PROCESSUS WORKER — traitement asynchrone (transcodage, notifications,
 *  indexation, agrégats analytics, emails).
 *  Se lance séparément de l'API : `npm run dev:worker`
 * ═══════════════════════════════════════════════════════════════════════════
 */

import { transcodeProcessor } from './modules/media/transcode.worker.js';
import { thumbnailProcessor } from './modules/media/thumbnails.worker.js';
import { searchIndexProcessor } from './modules/search/search.worker.js';
import { notificationProcessor } from './modules/social/notifications.worker.js';
import { analyticsProcessor } from './modules/analytics/analytics.worker.js';
import { emailProcessor } from './modules/auth/email.worker.js';

const workers: Worker[] = [];

function makeWorker(name: string, processor: (job: Job) => Promise<unknown>, concurrency: number) {
  const worker = new Worker(name, processor, { connection: bullConnection, concurrency });
  worker.on('failed', (job, err) => {
    console.error(`[${name}] job ${job?.id} échoué :`, err.message);
  });
  worker.on('completed', (job) => {
    console.log(`[${name}] job ${job.id} terminé`);
  });
  workers.push(worker);
  return worker;
}

async function main() {
  makeWorker(QUEUES.transcode, transcodeProcessor, env.TRANSCODE_CONCURRENCY);
  makeWorker(QUEUES.thumbnails, thumbnailProcessor, 2);
  makeWorker(QUEUES.search, searchIndexProcessor, 4);
  makeWorker(QUEUES.notifications, notificationProcessor, 8);
  makeWorker(QUEUES.analytics, analyticsProcessor, 2);
  makeWorker(QUEUES.email, emailProcessor, 4);

  // ── Jobs répétitifs ─────────────────────────────────────────────────────
  // Flush Redis -> Postgres des compteurs de vues
  await analyticsQueue.add(
    'flush-views',
    { type: 'flush-views' },
    { repeat: { every: env.VIEW_FLUSH_INTERVAL_MS }, jobId: 'repeat:flush-views' },
  );
  // Agrégats journaliers (toutes les 10 min, idempotent)
  await analyticsQueue.add(
    'rollup-daily',
    { type: 'rollup-daily' },
    { repeat: { every: 10 * 60 * 1000 }, jobId: 'repeat:rollup-daily' },
  );
  // Score de distribution "test & scale" (toutes les 5 min)
  await analyticsQueue.add(
    'recompute-hot-scores',
    { type: 'recompute-hot-scores' },
    { repeat: { every: 5 * 60 * 1000 }, jobId: 'repeat:hot-scores' },
  );
  // Hashtags tendances (toutes les 15 min)
  await analyticsQueue.add(
    'refresh-trending-tags',
    { type: 'refresh-trending-tags' },
    { repeat: { every: 15 * 60 * 1000 }, jobId: 'repeat:trending-tags' },
  );
  // Publication des vidéos programmées (toutes les minutes)
  await analyticsQueue.add(
    'publish-scheduled',
    { type: 'publish-scheduled' },
    { repeat: { every: 60 * 1000 }, jobId: 'repeat:publish-scheduled' },
  );

  console.log('⚙️  Workers Kelvyn Tube démarrés');
}

const shutdown = async () => {
  console.log('Arrêt des workers…');
  await Promise.allSettled(workers.map((w) => w.close()));
  await closeQueues();
  await closeRedis();
  await prisma.$disconnect();
  process.exit(0);
};

process.on('SIGINT', () => void shutdown());
process.on('SIGTERM', () => void shutdown());

main().catch((err) => {
  console.error('Échec du démarrage des workers :', err);
  process.exit(1);
});
