import Redis from 'ioredis';
import { env } from '../config/env.js';

/**
 * Trois connexions distinctes :
 *  - `redis`      : commandes classiques (cache, compteurs)
 *  - `redisSub`   : abonné Pub/Sub (une connexion en mode subscribe ne peut plus rien faire d'autre)
 *  - `redisPub`   : publication Pub/Sub
 *  - `bullConnection` : options réutilisées par BullMQ (maxRetriesPerRequest doit être null)
 */
export const redis = new Redis(env.REDIS_URL, {
  maxRetriesPerRequest: 3,
  lazyConnect: false,
});

export const redisPub = new Redis(env.REDIS_URL, { maxRetriesPerRequest: 3 });
export const redisSub = new Redis(env.REDIS_URL, { maxRetriesPerRequest: 3 });

export const bullConnection = {
  url: env.REDIS_URL,
  maxRetriesPerRequest: null as null,
};

redis.on('error', (err) => {
  console.error('[redis] erreur', err.message);
});

export async function closeRedis() {
  await Promise.allSettled([redis.quit(), redisPub.quit(), redisSub.quit()]);
}
