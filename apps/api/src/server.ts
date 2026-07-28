import Fastify, { type FastifyInstance } from 'fastify';
import cors from '@fastify/cors';
import cookie from '@fastify/cookie';
import multipart from '@fastify/multipart';
import rateLimit from '@fastify/rate-limit';
import websocket from '@fastify/websocket';
import { ROUTES } from '@kelvyntube/shared';
import { env, isDev, corsOrigins } from './config/env.js';
import { sendError } from './lib/errors.js';
import authPlugin from './plugins/auth.js';
import { registerModules } from './modules/index.js';
import { registerWebsocket } from './ws.js';
import { redis } from './lib/redis.js';
import { prisma } from '@kelvyntube/db';

export async function buildServer(): Promise<FastifyInstance> {
  const app = Fastify({
    logger: isDev
      ? { transport: { target: 'pino-pretty', options: { translateTime: 'HH:MM:ss', ignore: 'pid,hostname' } } }
      : true,
    trustProxy: true,
    bodyLimit: 20 * 1024 * 1024, // 20 Mo (les chunks vidéo passent en multipart)
  });

  // ── Plugins ─────────────────────────────────────────────────────────────
  await app.register(cors, {
    origin: corsOrigins,
    credentials: true,
    exposedHeaders: ['x-total-count'],
  });

  await app.register(cookie, { secret: env.JWT_ACCESS_SECRET });

  await app.register(multipart, {
    limits: { fileSize: 200 * 1024 * 1024 }, // 200 Mo par part
  });

  await app.register(rateLimit, {
    global: false,
    redis,
    keyGenerator: (req) => req.user?.sub ?? req.ip,
  });

  await app.register(websocket);
  await app.register(authPlugin);

  // ── Gestion d'erreur centralisée ────────────────────────────────────────
  app.setErrorHandler((err, _req, reply) => sendError(reply, err));

  app.setNotFoundHandler((req, reply) => {
    reply.status(404).send({
      error: { code: 'NOT_FOUND', message: `Route ${req.method} ${req.url} introuvable` },
    });
  });

  // ── Santé ───────────────────────────────────────────────────────────────
  app.get(ROUTES.health, async () => {
    const [dbOk, redisOk] = await Promise.all([
      prisma.$queryRaw`SELECT 1`.then(() => true).catch(() => false),
      redis.ping().then(() => true).catch(() => false),
    ]);
    return {
      status: dbOk && redisOk ? 'ok' : 'degraded',
      services: { database: dbOk, redis: redisOk },
      version: '0.1.0',
      uptime: process.uptime(),
    };
  });

  // ── WebSocket + modules métier ──────────────────────────────────────────
  await registerWebsocket(app);
  await registerModules(app);

  return app;
}
