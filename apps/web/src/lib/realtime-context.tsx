'use client';

import {
  createContext,
  useContext,
  useEffect,
  useMemo,
  useRef,
  useCallback,
  type ReactNode,
} from 'react';
import { getAccessToken, onAccessTokenChange } from './api';

type Handler = (data: unknown) => void;

interface RealtimeContextValue {
  /** Abonne un callback à un événement WebSocket. Renvoie la fonction de désabonnement. */
  on: (event: string, handler: Handler) => () => void;
  /** Rejoint une room (`video:<id>`, `channel:<id>`). */
  subscribe: (room: string) => () => void;
  connected: () => boolean;
}

const RealtimeContext = createContext<RealtimeContextValue | null>(null);

const WS_URL = process.env.NEXT_PUBLIC_WS_URL ?? 'ws://localhost:4000/ws';

export function RealtimeProvider({ children }: { children: ReactNode }) {
  const socketRef = useRef<WebSocket | null>(null);
  const handlersRef = useRef(new Map<string, Set<Handler>>());
  const roomsRef = useRef(new Set<string>());
  const reconnectRef = useRef<ReturnType<typeof setTimeout> | null>(null);
  const attemptsRef = useRef(0);

  const connect = useCallback(() => {
    if (typeof window === 'undefined') return;
    if (socketRef.current?.readyState === WebSocket.OPEN) return;

    const token = getAccessToken();
    const url = token ? `${WS_URL}?token=${encodeURIComponent(token)}` : WS_URL;
    const socket = new WebSocket(url);
    socketRef.current = socket;

    socket.onopen = () => {
      attemptsRef.current = 0;
      for (const room of roomsRef.current) {
        socket.send(JSON.stringify({ type: 'subscribe', room }));
      }
    };

    socket.onmessage = (ev) => {
      try {
        const { event, data } = JSON.parse(ev.data as string) as { event: string; data: unknown };
        handlersRef.current.get(event)?.forEach((h) => h(data));
      } catch {
        /* message ignoré */
      }
    };

    socket.onclose = () => {
      // Reconnexion exponentielle plafonnée à 30 s
      const delay = Math.min(1000 * 2 ** attemptsRef.current, 30_000);
      attemptsRef.current += 1;
      reconnectRef.current = setTimeout(connect, delay);
    };

    socket.onerror = () => socket.close();
  }, []);

  useEffect(() => {
    connect();
    // Reconnecte avec le nouveau token à chaque login/logout
    const off = onAccessTokenChange(() => {
      socketRef.current?.close();
    });
    return () => {
      off();
      if (reconnectRef.current) clearTimeout(reconnectRef.current);
      socketRef.current?.close();
      socketRef.current = null;
    };
  }, [connect]);

  const on = useCallback((event: string, handler: Handler) => {
    let set = handlersRef.current.get(event);
    if (!set) {
      set = new Set();
      handlersRef.current.set(event, set);
    }
    set.add(handler);
    return () => {
      set!.delete(handler);
    };
  }, []);

  const subscribe = useCallback((room: string) => {
    roomsRef.current.add(room);
    if (socketRef.current?.readyState === WebSocket.OPEN) {
      socketRef.current.send(JSON.stringify({ type: 'subscribe', room }));
    }
    return () => {
      roomsRef.current.delete(room);
      if (socketRef.current?.readyState === WebSocket.OPEN) {
        socketRef.current.send(JSON.stringify({ type: 'unsubscribe', room }));
      }
    };
  }, []);

  const connected = useCallback(
    () => socketRef.current?.readyState === WebSocket.OPEN,
    [],
  );

  const value = useMemo(() => ({ on, subscribe, connected }), [on, subscribe, connected]);

  return <RealtimeContext.Provider value={value}>{children}</RealtimeContext.Provider>;
}

export function useRealtime(): RealtimeContextValue {
  const ctx = useContext(RealtimeContext);
  if (!ctx) throw new Error('useRealtime doit être utilisé dans <RealtimeProvider>');
  return ctx;
}

/** Raccourci : écoute un événement WS pour une room donnée. */
export function useRealtimeEvent(event: string, handler: Handler, room?: string) {
  const { on, subscribe } = useRealtime();
  const handlerRef = useRef(handler);
  handlerRef.current = handler;

  useEffect(() => {
    const offEvent = on(event, (data) => handlerRef.current(data));
    const offRoom = room ? subscribe(room) : undefined;
    return () => {
      offEvent();
      offRoom?.();
    };
  }, [event, room, on, subscribe]);
}
