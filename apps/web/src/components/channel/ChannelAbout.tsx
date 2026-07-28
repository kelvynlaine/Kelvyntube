'use client';

import { CalendarDays, Eye, Link2, MapPin, Users, Video } from 'lucide-react';
import type { ReactNode } from 'react';
import { formatCompactNumber, type ChannelDTO } from '@kelvyntube/shared';
import { RichText } from '@kelvyntube/ui';

/**
 * Contenu « À propos » d'une chaîne — partagé par la modale de l'en-tête
 * et par l'onglet `/a-propos`.
 */

/** Date d'inscription formatée en français (jour + mois + année). */
function formatJoinDate(iso: string): string {
  const date = new Date(iso);
  if (Number.isNaN(date.getTime())) return '—';
  return new Intl.DateTimeFormat('fr-FR', {
    day: 'numeric',
    month: 'long',
    year: 'numeric',
  }).format(date);
}

/** Domaine lisible d'un lien externe (repli sur l'URL brute). */
function linkLabel(url: string): string {
  try {
    return new URL(url).host.replace(/^www\./, '');
  } catch {
    return url;
  }
}

function Stat({ icon, children }: { icon: ReactNode; children: ReactNode }) {
  return (
    <li className="flex items-center gap-3 text-kt-base text-fg">
      <span aria-hidden="true" className="text-fg-muted">
        {icon}
      </span>
      <span>{children}</span>
    </li>
  );
}

export interface ChannelAboutProps {
  channel: ChannelDTO;
  /** Actions additionnelles (partage…) rendues en bas du bloc. */
  footer?: ReactNode;
}

export function ChannelAbout({ channel, footer }: ChannelAboutProps) {
  return (
    <div className="flex flex-col gap-6">
      <section className="flex flex-col gap-2">
        <h3 className="text-kt-md font-medium text-fg">Description</h3>
        {channel.description ? (
          <RichText text={channel.description} className="text-kt-base text-fg-muted" />
        ) : (
          <p className="text-kt-base text-fg-subtle">
            Cette chaîne n’a pas encore de description.
          </p>
        )}
      </section>

      {channel.links.length > 0 ? (
        <section className="flex flex-col gap-2">
          <h3 className="text-kt-md font-medium text-fg">Liens</h3>
          <ul className="flex flex-col gap-2">
            {channel.links.map((link) => (
              <li key={`${link.title}-${link.url}`} className="flex items-center gap-3">
                <Link2 size={18} aria-hidden="true" className="shrink-0 text-fg-muted" />
                <a
                  href={link.url}
                  target="_blank"
                  rel="noopener noreferrer nofollow"
                  className="min-w-0 rounded text-kt-base text-accent-fg hover:underline kt-focus-ring"
                >
                  <span className="font-medium">{link.title}</span>
                  <span className="ml-2 text-fg-subtle">{linkLabel(link.url)}</span>
                </a>
              </li>
            ))}
          </ul>
        </section>
      ) : null}

      <section className="flex flex-col gap-2">
        <h3 className="text-kt-md font-medium text-fg">Informations</h3>
        <ul className="flex flex-col gap-3">
          <Stat icon={<span className="font-medium">@</span>}>{channel.handle}</Stat>
          {channel.location ? (
            <Stat icon={<MapPin size={18} />}>{channel.location}</Stat>
          ) : null}
          <Stat icon={<CalendarDays size={18} />}>
            Inscrit le {formatJoinDate(channel.createdAt)}
          </Stat>
          <Stat icon={<Users size={18} />}>
            {formatCompactNumber(channel.subscriberCount)} abonnés
          </Stat>
          <Stat icon={<Video size={18} />}>
            {formatCompactNumber(channel.videoCount)} vidéos
          </Stat>
          <Stat icon={<Eye size={18} />}>
            {new Intl.NumberFormat('fr-FR').format(channel.totalViews)} vues au total
          </Stat>
        </ul>
      </section>

      {footer ? <div className="flex flex-wrap items-center gap-2">{footer}</div> : null}
    </div>
  );
}
