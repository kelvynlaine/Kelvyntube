import { PrismaClient } from '@prisma/client';

export * from '@prisma/client';

declare global {
  // eslint-disable-next-line no-var
  var __kelvyntubePrisma: PrismaClient | undefined;
}

/**
 * Client Prisma singleton.
 * En développement on le stocke sur `globalThis` pour survivre au hot-reload
 * (sinon chaque rechargement ouvre un nouveau pool de connexions).
 */
export const prisma: PrismaClient =
  globalThis.__kelvyntubePrisma ??
  new PrismaClient({
    log:
      process.env.NODE_ENV === 'development'
        ? ['warn', 'error']
        : ['error'],
  });

if (process.env.NODE_ENV !== 'production') {
  globalThis.__kelvyntubePrisma = prisma;
}

/** Sérialise les BigInt (viewCount, watchTimeSec…) en number pour JSON. */
export function serializeBigInt<T>(value: T): T {
  return JSON.parse(
    JSON.stringify(value, (_key, v) => (typeof v === 'bigint' ? Number(v) : v)),
  ) as T;
}

export default prisma;
