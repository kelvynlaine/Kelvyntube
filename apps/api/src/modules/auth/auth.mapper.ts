import type { AuthUserDTO, AuthResponseDTO, AuthTokensDTO } from '@kelvyntube/shared';
import { channelSummarySelect, toChannelSummary } from '../../lib/serializers.js';
import { accessTtlSeconds } from '../../lib/jwt.js';

/**
 * ═══════════════════════════════════════════════════════════════════════════
 *  MAPPERS AUTH — User Prisma -> AuthUserDTO / AuthResponseDTO
 *  Toute route d'authentification passe par ici : c'est la seule garantie que
 *  le frontend reçoit exactement la forme déclarée dans `@kelvyntube/shared`.
 * ═══════════════════════════════════════════════════════════════════════════
 */

/** Sélection Prisma minimale nécessaire à la construction d'un `AuthUserDTO`. */
export const authUserSelect = {
  id: true,
  email: true,
  emailVerified: true,
  displayName: true,
  avatarUrl: true,
  role: true,
  interests: true,
  onboardedAt: true,
  theme: true,
  autoplay: true,
  locale: true,
  activeChannelId: true,
  createdAt: true,
  bannedAt: true,
  channels: {
    select: channelSummarySelect,
    orderBy: { createdAt: 'asc' },
  },
} as const;

/**
 * Forme de la ligne renvoyée par `prisma.user.findX({ select: authUserSelect })`.
 * Déclarée explicitement (plutôt que via `Prisma.UserGetPayload`) pour rester
 * lisible et indépendante de la génération du client.
 */
export interface AuthUserRow {
  id: string;
  email: string;
  emailVerified: Date | null;
  displayName: string;
  avatarUrl: string | null;
  role: 'USER' | 'MODERATOR' | 'ADMIN';
  interests: string[];
  onboardedAt: Date | null;
  theme: string;
  autoplay: boolean;
  locale: string;
  activeChannelId: string | null;
  createdAt: Date;
  bannedAt: Date | null;
  channels: {
    id: string;
    handle: string;
    name: string;
    avatarUrl: string | null;
    verified: boolean;
    subscriberCount: number;
  }[];
}

export function toAuthUser(user: AuthUserRow): AuthUserDTO {
  return {
    id: user.id,
    email: user.email,
    emailVerified: user.emailVerified !== null,
    displayName: user.displayName,
    avatarUrl: user.avatarUrl,
    role: user.role,
    interests: user.interests,
    onboarded: user.onboardedAt !== null,
    theme: user.theme,
    autoplay: user.autoplay,
    locale: user.locale,
    channels: user.channels.map(toChannelSummary),
    activeChannelId: user.activeChannelId,
    createdAt: user.createdAt.toISOString(),
  };
}

export function toAuthTokens(accessToken: string, refreshToken?: string): AuthTokensDTO {
  return {
    accessToken,
    expiresIn: accessTtlSeconds(),
    // Le refresh token n'est renvoyé dans le JSON que pour les clients
    // non-navigateur ; le web s'appuie exclusivement sur le cookie httpOnly.
    ...(refreshToken ? { refreshToken } : {}),
  };
}

export function toAuthResponse(
  user: AuthUserRow,
  accessToken: string,
  refreshToken?: string,
): AuthResponseDTO {
  return { user: toAuthUser(user), tokens: toAuthTokens(accessToken, refreshToken) };
}
