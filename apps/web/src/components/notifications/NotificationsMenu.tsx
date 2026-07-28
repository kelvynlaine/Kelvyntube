'use client';

import { useEffect, useRef } from 'react';
import Link from 'next/link';
import { useQuery, useQueryClient, useMutation } from '@tanstack/react-query';
import { Bell, CheckCheck } from 'lucide-react';
import {
  ROUTES,
  WS_EVENTS,
  formatRelativeTime,
  type NotificationDTO,
  type CursorPage,
} from '@kelvyntube/shared';
import { Avatar, Button, EmptyState, Skeleton, useOnClickOutside, cn } from '@kelvyntube/ui';
import { api } from '@/lib/api';
import { useAuth } from '@/lib/auth-context';
import { useRealtime } from '@/lib/realtime-context';

interface NotificationsMenuProps {
  open: boolean;
  onClose: () => void;
}

/** Panneau des notifications, ouvert depuis la cloche de la barre supérieure. */
export function NotificationsMenu({ open, onClose }: NotificationsMenuProps) {
  const panelRef = useRef<HTMLDivElement>(null);
  const { user } = useAuth();
  const queryClient = useQueryClient();

  useOnClickOutside([panelRef], onClose, open);

  useEffect(() => {
    if (!open) return;
    const onKey = (e: KeyboardEvent) => {
      if (e.key === 'Escape') onClose();
    };
    document.addEventListener('keydown', onKey);
    return () => document.removeEventListener('keydown', onKey);
  }, [open, onClose]);

  const { data, isLoading } = useQuery({
    queryKey: ['notifications'],
    queryFn: () => api.get<CursorPage<NotificationDTO>>(ROUTES.notifications.list, { query: { limit: 20 } }),
    enabled: open && Boolean(user),
  });

  const markAllRead = useMutation({
    mutationFn: () => api.post(ROUTES.notifications.markAllRead),
    onSuccess: () => {
      void queryClient.invalidateQueries({ queryKey: ['notifications'] });
      void queryClient.invalidateQueries({ queryKey: ['notifications', 'unread'] });
    },
  });

  const markRead = useMutation({
    mutationFn: (id: string) => api.post(ROUTES.notifications.markRead(id)),
    onSuccess: () => {
      void queryClient.invalidateQueries({ queryKey: ['notifications'] });
      void queryClient.invalidateQueries({ queryKey: ['notifications', 'unread'] });
    },
  });

  if (!open) return null;

  const items = data?.items ?? [];

  return (
    <div
      ref={panelRef}
      role="dialog"
      aria-label="Notifications"
      className="absolute right-0 top-full z-50 mt-2 w-[400px] max-w-[calc(100vw-16px)] overflow-hidden rounded-kt border border-border bg-bg-elevated shadow-2xl animate-slide-up"
    >
      <header className="flex items-center justify-between border-b border-border px-4 py-3">
        <h2 className="text-kt-md font-medium">Notifications</h2>
        {items.some((n) => !n.read) && (
          <Button
            variant="ghost"
            size="sm"
            iconLeft={<CheckCheck size={16} />}
            onClick={() => markAllRead.mutate()}
            loading={markAllRead.isPending}
          >
            Tout marquer comme lu
          </Button>
        )}
      </header>

      <div className="kt-scroll max-h-[70vh] overflow-y-auto">
        {isLoading && (
          <div className="space-y-3 p-4">
            {Array.from({ length: 4 }).map((_, i) => (
              <div key={i} className="flex gap-3">
                <Skeleton variant="circle" className="h-10 w-10 shrink-0" />
                <div className="flex-1 space-y-2">
                  <Skeleton variant="text" className="h-3 w-4/5" />
                  <Skeleton variant="text" className="h-3 w-2/5" />
                </div>
              </div>
            ))}
          </div>
        )}

        {!isLoading && items.length === 0 && (
          <EmptyState
            icon={<Bell size={36} />}
            title="Aucune notification"
            description="Tes notifications d'abonnements et de commentaires apparaîtront ici."
            size="sm"
          />
        )}

        <ul>
          {items.map((n) => (
            <li key={n.id}>
              <Link
                href={n.link}
                onClick={() => {
                  if (!n.read) markRead.mutate(n.id);
                  onClose();
                }}
                className={cn(
                  'flex gap-3 px-4 py-3 transition-colors hover:bg-bg-hover kt-focus-ring',
                  !n.read && 'bg-accent/10',
                )}
              >
                <Avatar
                  name={n.actorChannel?.name ?? 'Kelvyn Tube'}
                  src={n.actorChannel?.avatarUrl ?? undefined}
                  size="md"
                  className="shrink-0"
                />
                <div className="min-w-0 flex-1">
                  <p className="kt-clamp-2 text-kt-base">{n.title}</p>
                  {n.body && <p className="kt-clamp-1 text-kt-sm text-fg-muted">{n.body}</p>}
                  <p className="mt-0.5 text-kt-sm text-fg-subtle">
                    {formatRelativeTime(n.createdAt)}
                  </p>
                </div>
                {n.imageUrl && (
                  /* eslint-disable-next-line @next/next/no-img-element */
                  <img
                    src={n.imageUrl}
                    alt=""
                    className="h-[56px] w-[100px] shrink-0 rounded object-cover"
                  />
                )}
                {!n.read && (
                  <span
                    aria-label="Non lue"
                    className="mt-2 h-2 w-2 shrink-0 self-start rounded-full bg-brand"
                  />
                )}
              </Link>
            </li>
          ))}
        </ul>
      </div>
    </div>
  );
}

/**
 * Compteur de notifications non lues, rafraîchi en direct par WebSocket.
 * Utilisé pour la pastille de la cloche.
 */
export function useUnreadNotifications(): number {
  const { user } = useAuth();
  const queryClient = useQueryClient();
  const { on } = useRealtime();

  const { data } = useQuery({
    queryKey: ['notifications', 'unread'],
    queryFn: () => api.get<{ count: number }>(ROUTES.notifications.unreadCount),
    enabled: Boolean(user),
    refetchInterval: 60_000,
  });

  useEffect(() => {
    if (!user) return;
    // Une notification poussée en direct incrémente immédiatement la pastille
    return on(WS_EVENTS.notification, () => {
      queryClient.setQueryData<{ count: number }>(['notifications', 'unread'], (prev) => ({
        count: (prev?.count ?? 0) + 1,
      }));
      void queryClient.invalidateQueries({ queryKey: ['notifications'] });
    });
  }, [user, on, queryClient]);

  return data?.count ?? 0;
}
