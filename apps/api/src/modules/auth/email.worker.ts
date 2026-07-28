import type { Job } from 'bullmq';
import type { EmailJob } from '../../lib/queue.js';
import { sendMail } from './mailer.js';

/**
 * ═══════════════════════════════════════════════════════════════════════════
 *  WORKER `kt-email` — consomme les jobs `EmailJob` et les envoie via SMTP.
 *  Toute erreur est propagée : BullMQ applique le backoff exponentiel
 *  configuré dans `lib/queue.ts` (3 tentatives).
 * ═══════════════════════════════════════════════════════════════════════════
 */

/** Garde de type : le payload d'un job n'est jamais typé par BullMQ. */
function isEmailJob(data: unknown): data is EmailJob {
  if (typeof data !== 'object' || data === null) return false;
  const d = data as Record<string, unknown>;
  return (
    typeof d.to === 'string' &&
    d.to.includes('@') &&
    typeof d.subject === 'string' &&
    typeof d.html === 'string' &&
    (d.text === undefined || typeof d.text === 'string')
  );
}

export async function emailProcessor(job: Job): Promise<void> {
  if (!isEmailJob(job.data)) {
    // Payload irrécupérable : inutile de réessayer, on échoue explicitement.
    throw new Error(
      `Job email ${job.id ?? '?'} invalide : "to", "subject" et "html" sont requis`,
    );
  }

  const messageId = await sendMail(job.data);
  await job.updateProgress(100);
  job.log(`Email envoyé à ${job.data.to} (${messageId})`).catch(() => undefined);
}
