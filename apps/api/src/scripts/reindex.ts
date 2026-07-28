/**
 * ═══════════════════════════════════════════════════════════════════════════
 *  RÉINDEXATION COMPLÈTE DE LA RECHERCHE
 *
 *  Le seed écrit directement en base sans passer par l'API : l'index
 *  Meilisearch reste donc vide après un `db:seed`. Ce script reconstruit
 *  l'index à partir de PostgreSQL.
 *
 *  Usage :  npm run search:reindex -w @kelvyntube/api
 *           (déjà inclus dans `npm run setup`)
 * ═══════════════════════════════════════════════════════════════════════════
 */
import { prisma } from '@kelvyntube/db';
import { searchQueue } from '../lib/queue.js';
import {
  ensureIndexes,
  isMeiliAvailable,
  getIndex,
  MEILI_INDEX,
} from '../modules/search/meili.js';
import { closeRedis } from '../lib/redis.js';
import { closeQueues } from '../lib/queue.js';

const BATCH = 200;

async function main() {
  console.log('🔎 Réindexation de la recherche…\n');

  if (!(await isMeiliAvailable(true))) {
    console.error(
      '❌ Meilisearch est injoignable. Démarre l\'infrastructure (`npm run infra:up`) puis relance.',
    );
    console.error(
      '   (Le site reste fonctionnel sans Meilisearch : la recherche bascule sur PostgreSQL.)',
    );
    process.exitCode = 1;
    return;
  }

  await ensureIndexes();

  // ── Purge des index existants pour repartir d'un état propre ───────────
  for (const uid of Object.values(MEILI_INDEX)) {
    try {
      await getIndex(uid as never).deleteAllDocuments();
    } catch {
      /* index absent — `ensureIndexes` vient de le créer */
    }
  }

  let queued = 0;

  // ── Vidéos publiques et prêtes ─────────────────────────────────────────
  let cursor: string | undefined;
  for (;;) {
    const videos = await prisma.video.findMany({
      where: { status: 'READY', visibility: 'PUBLIC', deletedAt: null },
      select: { id: true },
      orderBy: { id: 'asc' },
      take: BATCH,
      ...(cursor ? { cursor: { id: cursor }, skip: 1 } : {}),
    });
    if (videos.length === 0) break;
    await searchQueue.addBulk(
      videos.map((v) => ({
        name: 'index-video',
        data: { action: 'upsert' as const, entity: 'video' as const, id: v.id },
      })),
    );
    queued += videos.length;
    cursor = videos[videos.length - 1].id;
    process.stdout.write(`\r  vidéos enfilées : ${queued}`);
  }
  console.log('');

  // ── Chaînes ────────────────────────────────────────────────────────────
  const channels = await prisma.channel.findMany({ select: { id: true } });
  await searchQueue.addBulk(
    channels.map((c) => ({
      name: 'index-channel',
      data: { action: 'upsert' as const, entity: 'channel' as const, id: c.id },
    })),
  );
  console.log(`  chaînes enfilées : ${channels.length}`);

  // ── Playlists publiques ────────────────────────────────────────────────
  const playlists = await prisma.playlist.findMany({
    where: { visibility: 'PUBLIC', kind: 'USER' },
    select: { id: true },
  });
  await searchQueue.addBulk(
    playlists.map((p) => ({
      name: 'index-playlist',
      data: { action: 'upsert' as const, entity: 'playlist' as const, id: p.id },
    })),
  );
  console.log(`  playlists enfilées : ${playlists.length}`);

  console.log(
    `\n✅ ${queued + channels.length + playlists.length} jobs d'indexation enfilés.`,
  );
  console.log(
    '   Lance le worker (`npm run dev:worker`) pour qu\'ils soient traités.',
  );
}

main()
  .catch((err) => {
    console.error('❌ Échec de la réindexation :', err);
    process.exitCode = 1;
  })
  .finally(async () => {
    await closeQueues();
    await closeRedis();
    await prisma.$disconnect();
  });
