import nodemailer from 'nodemailer';
import { env, isProd } from '../../config/env.js';
import type { EmailJob } from '../../lib/queue.js';

/**
 * ═══════════════════════════════════════════════════════════════════════════
 *  ENVOI D'EMAILS (SMTP)
 *  En développement, pointe sur Mailpit (localhost:1025, sans auth ni TLS).
 *  En production, SMTP_USER / SMTP_PASS activent l'authentification.
 *  Le transport est créé paresseusement puis réutilisé (pool de connexions).
 * ═══════════════════════════════════════════════════════════════════════════
 */

function createTransport() {
  return nodemailer.createTransport({
    host: env.SMTP_HOST,
    port: env.SMTP_PORT,
    // 465 = SMTPS implicite ; sinon STARTTLS opportuniste (Mailpit n'en a pas)
    secure: env.SMTP_PORT === 465,
    auth: env.SMTP_USER ? { user: env.SMTP_USER, pass: env.SMTP_PASS } : undefined,
    // Mailpit utilise un certificat auto-signé : on ne l'exige qu'en production
    tls: { rejectUnauthorized: isProd },
    pool: true,
    maxConnections: 3,
  });
}

type Transport = ReturnType<typeof createTransport>;

let transporter: Transport | null = null;

export function getTransporter(): Transport {
  transporter ??= createTransport();
  return transporter;
}

/** Repli texte brut lorsque le job ne fournit pas de version `text`. */
export function htmlToText(html: string): string {
  return html
    .replace(/<style[\s\S]*?<\/style>/gi, '')
    .replace(/<head[\s\S]*?<\/head>/gi, '')
    .replace(/<br\s*\/?>/gi, '\n')
    .replace(/<\/(p|div|tr|h1|h2|h3)>/gi, '\n')
    .replace(/<[^>]+>/g, '')
    .replace(/&nbsp;/g, ' ')
    .replace(/&amp;/g, '&')
    .replace(/&lt;/g, '<')
    .replace(/&gt;/g, '>')
    .replace(/&quot;/g, '"')
    .replace(/&#39;/g, "'")
    .replace(/\n{3,}/g, '\n\n')
    .split('\n')
    .map((line) => line.trim())
    .join('\n')
    .trim();
}

/** Envoie un email. Lève en cas d'échec : BullMQ se chargera des retries. */
export async function sendMail(job: EmailJob): Promise<string> {
  const info = await getTransporter().sendMail({
    from: env.MAIL_FROM,
    to: job.to,
    subject: job.subject,
    html: job.html,
    text: job.text ?? htmlToText(job.html),
  });
  return info.messageId;
}

/** Ferme le pool SMTP (arrêt propre du worker). */
export function closeMailer(): void {
  transporter?.close();
  transporter = null;
}
