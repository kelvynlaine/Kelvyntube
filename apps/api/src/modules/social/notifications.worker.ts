import type { Job } from 'bullmq';
import { prisma } from '@kelvyntube/db';
import type { NotificationType } from '@kelvyntube/shared';
import type { NotificationJob } from '../../lib/queue.js';
import {
  broadcastNotifications,
  createNotification,
  notificationSelect,
} from './notifications.service.js';

/**
 * ═══════════════════════════════════════════════════════════════════════════
 *  WORKER NOTIFICATIONS
 *
 *  Deux modes :
 *   1. destinataire unique (`userId`)      → une écriture + une diffusion.
 *   2. fan-out (`fanoutChannelId`)         → tous les abonnés d'une chaîne.
 *
 *  Le fan-out est le point chaud : une chaîne peut avoir des millions
 *  d'abonnés. On ne charge JAMAIS la liste complète en mémoire :
 *   - parcours par curseur (`id` croissant), lots de 500 abonnements ;
 *   - `createMany` par lot (une seule requête d'écriture) ;
 *   - relecture du lot fraîchement écrit pour récupérer les identifiants,
 *     puis diffusion temps réel ;
 *   - filtrage du niveau de cloche AVANT écriture :
 *       • NONE          → jamais notifié ;
 *       • ALL           → toujours notifié ;
 *       • PERSONALIZED  → seulement si l'abonné a regardé au moins une vidéo
 *                         de la chaîne dans les 90 derniers jours (sinon on
 *                         spamme des abonnés inactifs).
 *  L'empreinte mémoire est donc constante, quel que soit le nombre d'abonnés.
 * ═══════════════════════════════════════════════════════════════════════════
 */

/** Taille d'un lot d'abonnés traité d'un coup. */
const FANOUT_BATCH = 500;

/** Fenêtre d'activité pour le niveau PERSONALIZED. */
const PERSONALIZED_WINDOW_DAYS = 90;

export async function notificationProcessor(job: Job<NotificationJob>): Promise<void> {
  const data = job.data;

  // ── Mode 1 : destinataire unique ────────────────────────────────────────
  if (data.userId) {
    await createNotification({
      userId: data.userId,
      type: data.type as NotificationType,
      title: data.title,
      body: data.body ?? null,
      imageUrl: data.imageUrl ?? null,
      link: data.link,
      actorChannelId: data.actorChannelId ?? null,
      videoId: data.videoId ?? null,
      commentId: data.commentId ?? null,
    });
    return;
  }

  // ── Mode 2 : fan-out vers les abonnés d'une chaîne ──────────────────────
  if (data.fanoutChannelId) {
    await fanout(job, data, data.fanoutChannelId);
    return;
  }

  throw new Error('Job de notification invalide : ni `userId` ni `fanoutChannelId`');
}

async function fanout(
  job: Job<NotificationJob>,
  data: NotificationJob,
  channelId: string,
): Promise<void> {
  const channel = await prisma.channel.findUnique({
    where: { id: channelId },
    select: { id: true, ownerId: true },
  });
  if (!channel) return; // chaîne supprimée entre-temps : rien à faire

  const activeSince = new Date(Date.now() - PERSONALIZED_WINDOW_DAYS * 24 * 60 * 60 * 1000);

  let cursorId: string | undefined;
  let delivered = 0;

  for (;;) {
    const subs = await prisma.subscription.findMany({
      where: { channelId, level: { not: 'NONE' } },
      select: { id: true, subscriberId: true, level: true },
      orderBy: { id: 'asc' },
      take: FANOUT_BATCH,
      ...(cursorId ? { skip: 1, cursor: { id: cursorId } } : {}),
    });
    if (subs.length === 0) break;
    cursorId = subs[subs.length - 1]?.id;

    // Le créateur ne se notifie pas de sa propre publication.
    const candidates = subs.filter((s) => s.subscriberId !== channel.ownerId);

    const always = candidates.filter((s) => s.level === 'ALL').map((s) => s.subscriberId);
    const personalized = candidates
      .filter((s) => s.level === 'PERSONALIZED')
      .map((s) => s.subscriberId);

    let recipients = always;
    if (personalized.length > 0) {
      // Abonnés « personnalisés » réellement actifs sur la chaîne.
      const active = await prisma.watchHistory.findMany({
        where: {
          userId: { in: personalized },
          watchedAt: { gte: activeSince },
          video: { channelId },
        },
        select: { userId: true },
        distinct: ['userId'],
      });
      recipients = recipients.concat(active.map((a) => a.userId));
    }
    if (recipients.length === 0) continue;

    // Écriture groupée : une seule requête pour tout le lot.
    const createdAt = new Date();
    await prisma.notification.createMany({
      data: recipients.map((userId) => ({
        userId,
        type: data.type as NotificationType,
        title: data.title,
        body: data.body ?? null,
        imageUrl: data.imageUrl ?? null,
        link: data.link,
        actorChannelId: data.actorChannelId ?? null,
        videoId: data.videoId ?? null,
        commentId: data.commentId ?? null,
        createdAt,
      })),
      skipDuplicates: true,
    });

    // Relecture du lot pour obtenir les identifiants réels, puis temps réel.
    const rows = await prisma.notification.findMany({
      where: {
        userId: { in: recipients },
        type: data.type as NotificationType,
        createdAt,
        ...(data.videoId ? { videoId: data.videoId } : {}),
      },
      select: { ...notificationSelect, userId: true },
    });
    await broadcastNotifications(rows);

    delivered += recipients.length;
    await job.updateProgress(delivered);
  }
}
