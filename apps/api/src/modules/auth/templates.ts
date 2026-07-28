import { env } from '../../config/env.js';

/**
 * ═══════════════════════════════════════════════════════════════════════════
 *  GABARITS D'EMAILS TRANSACTIONNELS — Kelvyn Tube
 *  HTML sobre, compatible clients mail (tables + styles inline), en français.
 *  Palette : accent #ff0033 sur fond sombre.
 * ═══════════════════════════════════════════════════════════════════════════
 */

export interface EmailTemplate {
  subject: string;
  html: string;
  text: string;
}

const COLORS = {
  page: '#0b0b0b',
  card: '#161616',
  border: '#2a2a2a',
  accent: '#ff0033',
  text: '#f5f5f5',
  muted: '#a1a1a1',
} as const;

/** Échappe le contenu fourni par l'utilisateur avant injection dans le HTML. */
export function escapeHtml(value: string): string {
  return value
    .replace(/&/g, '&amp;')
    .replace(/</g, '&lt;')
    .replace(/>/g, '&gt;')
    .replace(/"/g, '&quot;')
    .replace(/'/g, '&#39;');
}

interface LayoutOptions {
  /** Titre affiché en haut du bloc de contenu. */
  heading: string;
  /** Paragraphes déjà échappés. */
  paragraphs: string[];
  cta?: { label: string; url: string };
  /** Petite note grise sous le bouton (durée de validité…). */
  note?: string;
}

/** Enveloppe commune : en-tête de marque, carte de contenu, pied de page. */
function layout({ heading, paragraphs, cta, note }: LayoutOptions): string {
  const body = paragraphs
    .map(
      (p) =>
        `<p style="margin:0 0 16px;font-size:15px;line-height:1.6;color:${COLORS.text};">${p}</p>`,
    )
    .join('');

  const button = cta
    ? `<table role="presentation" cellpadding="0" cellspacing="0" border="0" style="margin:24px 0;">
         <tr>
           <td align="center" bgcolor="${COLORS.accent}" style="border-radius:8px;">
             <a href="${escapeHtml(cta.url)}"
                style="display:inline-block;padding:14px 28px;font-family:Helvetica,Arial,sans-serif;
                       font-size:15px;font-weight:700;color:#ffffff;text-decoration:none;border-radius:8px;">
               ${escapeHtml(cta.label)}
             </a>
           </td>
         </tr>
       </table>
       <p style="margin:0 0 8px;font-size:12px;line-height:1.6;color:${COLORS.muted};">
         Si le bouton ne fonctionne pas, copie ce lien dans ton navigateur :<br />
         <span style="color:${COLORS.accent};word-break:break-all;">${escapeHtml(cta.url)}</span>
       </p>`
    : '';

  const noteHtml = note
    ? `<p style="margin:16px 0 0;font-size:12px;line-height:1.6;color:${COLORS.muted};">${note}</p>`
    : '';

  return `<!doctype html>
<html lang="fr">
  <head>
    <meta charset="utf-8" />
    <meta name="viewport" content="width=device-width,initial-scale=1" />
    <meta name="color-scheme" content="dark light" />
    <title>${escapeHtml(heading)}</title>
  </head>
  <body style="margin:0;padding:0;background-color:${COLORS.page};">
    <table role="presentation" width="100%" cellpadding="0" cellspacing="0" border="0"
           style="background-color:${COLORS.page};padding:32px 12px;">
      <tr>
        <td align="center">
          <table role="presentation" width="100%" cellpadding="0" cellspacing="0" border="0"
                 style="max-width:560px;font-family:Helvetica,Arial,sans-serif;">
            <!-- En-tête de marque -->
            <tr>
              <td style="padding:0 0 24px;">
                <span style="display:inline-block;width:34px;height:24px;background-color:${COLORS.accent};
                             border-radius:7px;vertical-align:middle;"></span>
                <span style="margin-left:10px;font-size:19px;font-weight:700;color:${COLORS.text};
                             letter-spacing:-0.4px;vertical-align:middle;">Kelvyn Tube</span>
              </td>
            </tr>
            <!-- Contenu -->
            <tr>
              <td style="background-color:${COLORS.card};border:1px solid ${COLORS.border};
                         border-radius:14px;padding:32px;">
                <h1 style="margin:0 0 20px;font-size:21px;line-height:1.3;color:${COLORS.text};
                           font-weight:700;">${escapeHtml(heading)}</h1>
                ${body}
                ${button}
                ${noteHtml}
              </td>
            </tr>
            <!-- Pied de page -->
            <tr>
              <td style="padding:24px 4px 0;font-size:12px;line-height:1.6;color:${COLORS.muted};">
                Cet email t'a été envoyé par Kelvyn Tube.<br />
                <a href="${escapeHtml(env.WEB_PUBLIC_URL)}"
                   style="color:${COLORS.muted};text-decoration:underline;">${escapeHtml(env.WEB_PUBLIC_URL)}</a>
              </td>
            </tr>
          </table>
        </td>
      </tr>
    </table>
  </body>
</html>`;
}

// ── Vérification d'adresse email ──────────────────────────────────────────

export function verificationEmail(opts: { displayName: string; url: string }): EmailTemplate {
  const name = escapeHtml(opts.displayName);
  return {
    subject: 'Confirme ton adresse email — Kelvyn Tube',
    html: layout({
      heading: 'Confirme ton adresse email',
      paragraphs: [
        `Salut ${name},`,
        'Bienvenue sur Kelvyn Tube. Il ne reste plus qu’une étape : confirme ton adresse email pour activer ton compte.',
      ],
      cta: { label: 'Confirmer mon email', url: opts.url },
      note: 'Ce lien expire dans 24 heures. Si tu n’es pas à l’origine de cette inscription, ignore simplement cet email.',
    }),
    text: [
      `Salut ${opts.displayName},`,
      '',
      'Bienvenue sur Kelvyn Tube. Confirme ton adresse email pour activer ton compte :',
      opts.url,
      '',
      "Ce lien expire dans 24 heures. Si tu n'es pas à l'origine de cette inscription, ignore cet email.",
    ].join('\n'),
  };
}

// ── Réinitialisation de mot de passe ──────────────────────────────────────

export function passwordResetEmail(opts: { displayName: string; url: string }): EmailTemplate {
  const name = escapeHtml(opts.displayName);
  return {
    subject: 'Réinitialise ton mot de passe — Kelvyn Tube',
    html: layout({
      heading: 'Réinitialisation du mot de passe',
      paragraphs: [
        `Salut ${name},`,
        'Tu as demandé à réinitialiser le mot de passe de ton compte Kelvyn Tube. Clique sur le bouton ci-dessous pour en choisir un nouveau.',
      ],
      cta: { label: 'Choisir un nouveau mot de passe', url: opts.url },
      note: 'Ce lien expire dans 1 heure et ne peut servir qu’une seule fois. Si tu n’as rien demandé, ton mot de passe actuel reste valide : aucune action n’est nécessaire.',
    }),
    text: [
      `Salut ${opts.displayName},`,
      '',
      'Tu as demandé à réinitialiser ton mot de passe Kelvyn Tube :',
      opts.url,
      '',
      "Ce lien expire dans 1 heure. Si tu n'as rien demandé, ignore cet email.",
    ].join('\n'),
  };
}

// ── Bienvenue (après onboarding / création de la première chaîne) ─────────

export function welcomeEmail(opts: { displayName: string; handle: string }): EmailTemplate {
  const name = escapeHtml(opts.displayName);
  const handle = escapeHtml(opts.handle);
  const channelUrl = `${env.WEB_PUBLIC_URL}/@${opts.handle}`;
  return {
    subject: `Bienvenue sur Kelvyn Tube, @${opts.handle} !`,
    html: layout({
      heading: 'Ta chaîne est en ligne',
      paragraphs: [
        `Salut ${name},`,
        `Ta chaîne <strong style="color:${COLORS.accent};">@${handle}</strong> vient d’être créée. Tu peux dès maintenant mettre en ligne ta première vidéo, personnaliser ta bannière et suivre tes statistiques dans Kelvyn Studio.`,
        'Bon tournage !',
      ],
      cta: { label: 'Voir ma chaîne', url: channelUrl },
    }),
    text: [
      `Salut ${opts.displayName},`,
      '',
      `Ta chaîne @${opts.handle} vient d'être créée sur Kelvyn Tube.`,
      channelUrl,
      '',
      'Mets en ligne ta première vidéo et suis tes statistiques dans Kelvyn Studio.',
    ].join('\n'),
  };
}
