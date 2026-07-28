'use client';

import {
  createContext,
  useContext,
  useEffect,
  useMemo,
  useState,
  useCallback,
  type ReactNode,
} from 'react';
import { useQueryClient } from '@tanstack/react-query';
import { ROUTES, type AuthUserDTO, type AuthResponseDTO } from '@kelvyntube/shared';
import { api, setAccessToken, getAccessToken } from './api';

interface AuthContextValue {
  user: AuthUserDTO | null;
  loading: boolean;
  /** Chaîne active (Studio, upload, commentaires). */
  activeChannel: AuthUserDTO['channels'][number] | null;
  login: (email: string, password: string) => Promise<void>;
  register: (email: string, password: string, displayName: string) => Promise<void>;
  logout: () => Promise<void>;
  refreshUser: () => Promise<void>;
  setActiveChannel: (channelId: string) => Promise<void>;
  /** Ouvre la modale de connexion (actions nécessitant un compte). */
  requireAuth: (action?: string) => boolean;
  authModalOpen: boolean;
  setAuthModalOpen: (open: boolean) => void;
}

const AuthContext = createContext<AuthContextValue | null>(null);

export function AuthProvider({ children }: { children: ReactNode }) {
  const [user, setUser] = useState<AuthUserDTO | null>(null);
  const [loading, setLoading] = useState(true);
  const [authModalOpen, setAuthModalOpen] = useState(false);
  const queryClient = useQueryClient();

  const loadMe = useCallback(async () => {
    try {
      const me = await api.get<AuthUserDTO>(ROUTES.auth.me, { allowAnonymous: true });
      setUser(me);
    } catch {
      setUser(null);
    }
  }, []);

  // Au montage : tente un refresh (le cookie httpOnly survit au rechargement)
  useEffect(() => {
    void (async () => {
      if (!getAccessToken()) await api.refresh();
      if (getAccessToken()) await loadMe();
      setLoading(false);
    })();
  }, [loadMe]);

  const login = useCallback(
    async (email: string, password: string) => {
      const res = await api.post<AuthResponseDTO>(ROUTES.auth.login, { email, password });
      setAccessToken(res.tokens.accessToken);
      setUser(res.user);
      setAuthModalOpen(false);
      await queryClient.invalidateQueries();
    },
    [queryClient],
  );

  const register = useCallback(
    async (email: string, password: string, displayName: string) => {
      const res = await api.post<AuthResponseDTO>(ROUTES.auth.register, {
        email,
        password,
        displayName,
      });
      setAccessToken(res.tokens.accessToken);
      setUser(res.user);
      setAuthModalOpen(false);
    },
    [],
  );

  const logout = useCallback(async () => {
    try {
      await api.post(ROUTES.auth.logout);
    } finally {
      setAccessToken(null);
      setUser(null);
      queryClient.clear();
    }
  }, [queryClient]);

  const setActiveChannel = useCallback(async (channelId: string) => {
    const res = await api.post<AuthResponseDTO>(ROUTES.auth.switchChannel(channelId));
    setAccessToken(res.tokens.accessToken);
    setUser(res.user);
  }, []);

  const requireAuth = useCallback(
    (_action?: string) => {
      if (user) return true;
      setAuthModalOpen(true);
      return false;
    },
    [user],
  );

  const activeChannel = useMemo(
    () =>
      user?.channels.find((c) => c.id === user.activeChannelId) ?? user?.channels[0] ?? null,
    [user],
  );

  const value = useMemo<AuthContextValue>(
    () => ({
      user,
      loading,
      activeChannel,
      login,
      register,
      logout,
      refreshUser: loadMe,
      setActiveChannel,
      requireAuth,
      authModalOpen,
      setAuthModalOpen,
    }),
    [
      user, loading, activeChannel, login, register, logout,
      loadMe, setActiveChannel, requireAuth, authModalOpen,
    ],
  );

  return <AuthContext.Provider value={value}>{children}</AuthContext.Provider>;
}

export function useAuth(): AuthContextValue {
  const ctx = useContext(AuthContext);
  if (!ctx) throw new Error('useAuth doit être utilisé dans <AuthProvider>');
  return ctx;
}
