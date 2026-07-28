import type { ApiError } from '@kelvyntube/shared';

/**
 * ═══════════════════════════════════════════════════════════════════════════
 *  CLIENT API TYPÉ
 *  Unique porte d'entrée vers `apps/api`. Gère :
 *   - l'access token en mémoire + refresh automatique sur 401
 *   - les cookies (refresh token httpOnly) via `credentials: 'include'`
 *   - la conversion des erreurs en `ApiClientError`
 * ═══════════════════════════════════════════════════════════════════════════
 */

export const API_BASE =
  process.env.NEXT_PUBLIC_API_URL ?? 'http://localhost:4000';

export class ApiClientError extends Error {
  constructor(
    public status: number,
    public code: string,
    message: string,
    public details?: Record<string, string[]>,
  ) {
    super(message);
    this.name = 'ApiClientError';
  }

  /** Message d'erreur pour un champ de formulaire donné. */
  fieldError(field: string): string | undefined {
    return this.details?.[field]?.[0];
  }
}

// ── Gestion de l'access token (mémoire, jamais localStorage) ───────────────

let accessToken: string | null = null;
let refreshPromise: Promise<boolean> | null = null;
const listeners = new Set<(token: string | null) => void>();

export function setAccessToken(token: string | null) {
  accessToken = token;
  listeners.forEach((l) => l(token));
}

export function getAccessToken(): string | null {
  return accessToken;
}

export function onAccessTokenChange(fn: (token: string | null) => void): () => void {
  listeners.add(fn);
  return () => listeners.delete(fn);
}

/** Tente un refresh (une seule requête concurrente maximum). */
async function refreshAccessToken(): Promise<boolean> {
  refreshPromise ??= (async () => {
    try {
      const res = await fetch(`${API_BASE}/api/v1/auth/refresh`, {
        method: 'POST',
        credentials: 'include',
      });
      if (!res.ok) {
        setAccessToken(null);
        return false;
      }
      const data = (await res.json()) as { tokens: { accessToken: string } };
      setAccessToken(data.tokens.accessToken);
      return true;
    } catch {
      setAccessToken(null);
      return false;
    } finally {
      refreshPromise = null;
    }
  })();
  return refreshPromise;
}

// ── Requête générique ──────────────────────────────────────────────────────

export interface RequestOptions extends Omit<RequestInit, 'body'> {
  body?: unknown;
  /** Paramètres de query string. */
  query?: Record<string, string | number | boolean | undefined | null>;
  /** Désactive le refresh auto (utilisé par /auth/refresh lui-même). */
  skipRefresh?: boolean;
  /** Rend la requête silencieuse en cas de 401 (endpoints optionnellement authentifiés). */
  allowAnonymous?: boolean;
}

function buildUrl(path: string, query?: RequestOptions['query']): string {
  const url = path.startsWith('http') ? path : `${API_BASE}${path}`;
  if (!query) return url;
  const params = new URLSearchParams();
  for (const [k, v] of Object.entries(query)) {
    if (v !== undefined && v !== null && v !== '') params.set(k, String(v));
  }
  const qs = params.toString();
  return qs ? `${url}?${qs}` : url;
}

export async function apiRequest<T>(path: string, options: RequestOptions = {}): Promise<T> {
  const { body, query, skipRefresh, allowAnonymous, headers, ...rest } = options;

  const isFormData = body instanceof FormData;

  const doFetch = async (): Promise<Response> =>
    fetch(buildUrl(path, query), {
      ...rest,
      credentials: 'include',
      headers: {
        ...(isFormData ? {} : body !== undefined ? { 'Content-Type': 'application/json' } : {}),
        ...(accessToken ? { Authorization: `Bearer ${accessToken}` } : {}),
        ...(headers as Record<string, string>),
      },
      body: isFormData ? (body as FormData) : body !== undefined ? JSON.stringify(body) : undefined,
    });

  let res = await doFetch();

  // Refresh transparent sur 401
  if (res.status === 401 && !skipRefresh && !allowAnonymous) {
    const refreshed = await refreshAccessToken();
    if (refreshed) res = await doFetch();
  }

  if (res.status === 204) return undefined as T;

  const contentType = res.headers.get('content-type') ?? '';
  const payload = contentType.includes('application/json') ? await res.json() : await res.text();

  if (!res.ok) {
    const err = payload as ApiError;
    throw new ApiClientError(
      res.status,
      err?.error?.code ?? 'UNKNOWN',
      err?.error?.message ?? `Erreur ${res.status}`,
      err?.error?.details,
    );
  }

  return payload as T;
}

export const api = {
  get: <T>(path: string, options?: RequestOptions) =>
    apiRequest<T>(path, { ...options, method: 'GET' }),
  post: <T>(path: string, body?: unknown, options?: RequestOptions) =>
    apiRequest<T>(path, { ...options, method: 'POST', body }),
  patch: <T>(path: string, body?: unknown, options?: RequestOptions) =>
    apiRequest<T>(path, { ...options, method: 'PATCH', body }),
  put: <T>(path: string, body?: unknown, options?: RequestOptions) =>
    apiRequest<T>(path, { ...options, method: 'PUT', body }),
  delete: <T>(path: string, options?: RequestOptions) =>
    apiRequest<T>(path, { ...options, method: 'DELETE' }),
  refresh: refreshAccessToken,
};
