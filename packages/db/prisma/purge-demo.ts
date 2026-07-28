/**
 * ═══════════════════════════════════════════════════════════════════════════
 *  PURGE DES DONNÉES DE DÉMONSTRATION
 *
 *  Supprime le catalogue factice généré par `prisma/seed.ts` (vidéos de
 *  démonstration pointant vers des médias externes, chaînes et comptes
 *  fictifs, commentaires et statistiques associés) tout en **préservant
 *  intégralement le contenu réel** : comptes réels, chaînes réelles, et
 *  surtout toute vidéo effectivement mise en ligne.
 *
 *  Discriminant : le seed utilise un PRNG à graine fixe, donc tous ses
 *  identifiants commencent par le même préfixe (`SEED_ID_PREFIX`). Les vraies
 *  écritures passent par `cuid()` et produisent un préfixe différent. On ne se
 *  fie PAS aux URLs de média : une vidéo de seed peut ne pas en avoir (états
 *  PROCESSING / FAILED volontairement injectés).
 *
 *  Règle de préservation, dans cet ordre :
 *   1. toute vidéo dont l'id n'est pas issu du seed est réelle → conservée ;
 *   2. toute chaîne possédant au moins une vidéo réelle est conservée,
 *      même si la chaîne elle-même vient du seed ;
 *   3. tout utilisateur non issu du seed, ou propriétaire d'une chaîne
 *      conservée, est conservé.
 *
 *  Usage :
 *    npm run db:purge-demo           # simulation, n'écrit rien
 *    npm run db:purge-demo -- --yes  # exécute réellement
 *    npm run db:purge-demo -- --yes --bots   # purge aussi les comptes robots
 * ═══════════════════════════════════════════════════════════════════════════
 */
import { PrismaClient } from '@prisma/client';

const prisma = new PrismaClient();

/** Préfixe des identifiants produits par le PRNG déterministe du seed. */
const SEED_ID_PREFIX = 'c000c29a';

const argv = process.argv.slice(2);
const APPLY = argv.includes('--yes');
const PURGE_BOTS = argv.includes('--bots');

const isSeedId = (id: string) => id.startsWith(SEED_ID_PREFIX);

function line(label: string, value: number | string) {
  console.log(`  ${label.padEnd(42, '.')} ${value}`);
}

async function main() {
  if (process.env.NODE_ENV === 'production') {
    throw new Error('Purge interdite en production.');
  }

  console.log(
    `\n🧹 Purge des données de démonstration — ${APPLY ? 'EXÉCUTION RÉELLE' : 'SIMULATION (aucune écriture)'}\n`,
  );

  // ── 1. Inventaire ───────────────────────────────────────────────────────
  const videos = await prisma.video.findMany({
    select: { id: true, title: true, channelId: true },
  });
  const realVideos = videos.filter((v) => !isSeedId(v.id));
  const seedVideos = videos.filter((v) => isSeedId(v.id));
  const seedVideoIds = seedVideos.map((v) => v.id);

  // Chaînes hébergeant au moins une vidéo réelle : intouchables.
  const channelsWithRealContent = new Set(realVideos.map((v) => v.channelId));

  const channels = await prisma.channel.findMany({
    select: { id: true, handle: true, ownerId: true },
  });
  const channelsToDelete = channels.filter(
    (c) => isSeedId(c.id) && !channelsWithRealContent.has(c.id),
  );
  const preservedChannels = channels.filter((c) => !channelsToDelete.some((d) => d.id === c.id));

  const preservedOwnerIds = new Set(preservedChannels.map((c) => c.ownerId));

  const users = await prisma.user.findMany({
    select: { id: true, email: true, isBot: true },
  });
  const usersToDelete = users.filter(
    (u) =>
      (isSeedId(u.id) || (PURGE_BOTS && u.isBot)) &&
      !preservedOwnerIds.has(u.id) &&
      // Un compte non issu du seed n'est jamais supprimé, sauf robot explicite.
      (isSeedId(u.id) || u.isBot),
  );

  // ── 2. Rapport avant action ─────────────────────────────────────────────
  console.log('Vidéos');
  line('réelles (conservées)', realVideos.length);
  line('de démonstration (supprimées)', seedVideos.length);
  console.log('\nChaînes');
  line('conservées', preservedChannels.length);
  line('supprimées', channelsToDelete.length);
  if (channelsWithRealContent.size) {
    const rescued = preservedChannels.filter(
      (c) => isSeedId(c.id) && channelsWithRealContent.has(c.id),
    );
    for (const c of rescued) {
      line(`  @${c.handle} conservée (contient du réel)`, '✓');
    }
  }
  console.log('\nComptes');
  line('conservés', users.length - usersToDelete.length);
  line('supprimés', usersToDelete.length);
  if (!PURGE_BOTS && users.some((u) => u.isBot)) {
    line('robots conservés (--bots pour purger)', users.filter((u) => u.isBot).length);
  }

  console.log('\nContenu réel préservé :');
  for (const v of realVideos) console.log(`  • ${v.title}`);

  if (!APPLY) {
    console.log('\n⚠️  Simulation terminée — relance avec `-- --yes` pour appliquer.\n');
    return;
  }

  // ── 3. Suppression ──────────────────────────────────────────────────────
  console.log('\nSuppression en cours…');

  // Les « likes » sont polymorphes : aucune clé étrangère ne les rattache aux
  // vidéos ni aux commentaires, ils ne partent donc pas en cascade.
  const seedCommentIds = seedVideoIds.length
    ? (
        await prisma.comment.findMany({
          where: { videoId: { in: seedVideoIds } },
          select: { id: true },
        })
      ).map((c) => c.id)
    : [];

  const orphanLikes = await prisma.like.deleteMany({
    where: {
      OR: [
        { targetType: 'VIDEO', targetId: { in: seedVideoIds } },
        { targetType: 'COMMENT', targetId: { in: seedCommentIds } },
      ],
    },
  });
  line('likes orphelins supprimés', orphanLikes.count);

  // Les vidéos emportent en cascade : commentaires, vues, variantes, chapitres,
  // sous-titres, tags de liaison, stats journalières, rétention, historique,
  // éléments de playlist et notifications associées.
  const deletedVideos = await prisma.video.deleteMany({
    where: { id: { in: seedVideoIds } },
  });
  line('vidéos supprimées', deletedVideos.count);

  const deletedChannels = await prisma.channel.deleteMany({
    where: { id: { in: channelsToDelete.map((c) => c.id) } },
  });
  line('chaînes supprimées', deletedChannels.count);

  const deletedUsers = await prisma.user.deleteMany({
    where: { id: { in: usersToDelete.map((u) => u.id) } },
  });
  line('comptes supprimés', deletedUsers.count);

  const deletedQueries = await prisma.searchQuery.deleteMany({
    where: { id: { startsWith: SEED_ID_PREFIX } },
  });
  line('requêtes de recherche factices supprimées', deletedQueries.count);

  // ── 4. Recalcul des compteurs dénormalisés ──────────────────────────────
  // Les compteurs sont dénormalisés : après suppression ils mentent encore.
  console.log('\nRecalcul des compteurs…');

  const remainingChannels = await prisma.channel.findMany({ select: { id: true } });
  for (const channel of remainingChannels) {
    const agg = await prisma.video.aggregate({
      where: { channelId: channel.id, deletedAt: null },
      _count: { _all: true },
      _sum: { viewCount: true },
    });
    const subscriberCount = await prisma.subscription.count({
      where: { channelId: channel.id },
    });
    await prisma.channel.update({
      where: { id: channel.id },
      data: {
        videoCount: agg._count._all,
        totalViews: agg._sum.viewCount ?? BigInt(0),
        subscriberCount,
      },
    });
  }
  line('chaînes recalculées', remainingChannels.length);

  // Les hashtags sont conservés — ils forment le vocabulaire proposé dans le
  // formulaire de publication — mais leurs compteurs doivent refléter le réel.
  const tags = await prisma.tag.findMany({ select: { id: true } });
  let touchedTags = 0;
  for (const tag of tags) {
    const usageCount = await prisma.videoTag.count({ where: { tagId: tag.id } });
    await prisma.tag.update({
      where: { id: tag.id },
      data: { usageCount, recentUsage: 0, trendingScore: 0 },
    });
    touchedTags += 1;
  }
  line('hashtags conservés et recalculés', touchedTags);

  // ── 5. État final ───────────────────────────────────────────────────────
  console.log('\n✅ Purge terminée.\n');
  line('vidéos restantes', await prisma.video.count());
  line('chaînes restantes', await prisma.channel.count());
  line('comptes restants', await prisma.user.count());
  line('commentaires restants', await prisma.comment.count());
  line('hashtags disponibles', await prisma.tag.count());
  console.log(
    '\n💡 Pense à relancer `npm run search:reindex` pour vider l\'index Meilisearch.\n',
  );
}

main()
  .catch((err) => {
    console.error('\n❌ Échec de la purge :', err);
    process.exitCode = 1;
  })
  .finally(() => prisma.$disconnect());
