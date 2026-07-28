'use client';

import type { ReactNode } from 'react';
import { StudioGuard } from './StudioGuard';
import { StudioShell } from './StudioShell';
import { useChannelId } from './useStudioUrlState';

/**
 * Assemble la garde d'accès et la chrome du Studio.
 * Sur `/studio` (sans `[channelId]`), la chrome n'est pas rendue : la page
 * se contente de rediriger vers la chaîne active.
 */
export function StudioChrome({ children }: { children: ReactNode }) {
  const channelId = useChannelId();

  return (
    <StudioGuard channelId={channelId}>
      {channelId ? <StudioShell channelId={channelId}>{children}</StudioShell> : children}
    </StudioGuard>
  );
}
