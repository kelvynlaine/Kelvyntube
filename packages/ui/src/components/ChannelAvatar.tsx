'use client';

import type { ChannelSummaryDTO } from '@kelvyntube/shared';
import { formatCompactNumber } from '@kelvyntube/shared';
import { cn } from '../cn';
import { resolveLinkComponent, type LinkComponent } from '../types';
import { Avatar, type AvatarSize } from './Avatar';
import { VerifiedBadge } from './VerifiedBadge';

export interface ChannelAvatarProps {
  channel: ChannelSummaryDTO;
  size?: AvatarSize;
  /** Affiche le nom de la chaîne à droite de l'avatar. */
  showName?: boolean;
  /** Affiche le nombre d'abonnés sous le nom (implique `showName`). */
  showSubscribers?: boolean;
  /** Enveloppe le rendu dans un lien vers la chaîne (vrai par défaut). */
  withLink?: boolean;
  /** Surcharge de l'URL (par défaut `/@handle`). */
  href?: string;
  linkComponent?: LinkComponent;
  className?: string;
  nameClassName?: string;
  onClick?: () => void;
}

/** Construit l'URL canonique d'une chaîne. */
export function buildChannelHref(handle: string): string {
  return handle.startsWith('@') ? `/${handle}` : `/@${handle}`;
}

/** Avatar de chaîne, éventuellement accompagné du nom et du nombre d'abonnés. */
export function ChannelAvatar({
  channel,
  size = 'md',
  showName = false,
  showSubscribers = false,
  withLink = true,
  href,
  linkComponent,
  className,
  nameClassName,
  onClick,
}: ChannelAvatarProps) {
  const Link = resolveLinkComponent(linkComponent);
  const target = href ?? buildChannelHref(channel.handle);

  const content = (
    <>
      <Avatar name={channel.name} src={channel.avatarUrl} size={size} />
      {showName || showSubscribers ? (
        <span className="flex min-w-0 flex-col">
          <span
            className={cn(
              'flex min-w-0 items-center gap-1 truncate text-kt-base font-medium text-fg',
              nameClassName,
            )}
          >
            <span className="truncate">{channel.name}</span>
            {channel.verified ? <VerifiedBadge /> : null}
          </span>
          {showSubscribers ? (
            <span className="truncate text-kt-sm text-fg-muted">
              {formatCompactNumber(channel.subscriberCount)} abonnés
            </span>
          ) : null}
        </span>
      ) : null}
    </>
  );

  const classes = cn('flex min-w-0 items-center gap-3', className);

  if (!withLink) {
    return <span className={classes}>{content}</span>;
  }

  return (
    <Link
      href={target}
      onClick={onClick}
      title={channel.name}
      aria-label={showName || showSubscribers ? undefined : channel.name}
      className={cn(classes, 'rounded-kt kt-focus-ring hover:opacity-90')}
    >
      {content}
    </Link>
  );
}
