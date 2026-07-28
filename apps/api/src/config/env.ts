import 'dotenv/config';
import { z } from 'zod';
import path from 'node:path';
import { fileURLToPath } from 'node:url';
import dotenv from 'dotenv';

// Charge aussi le .env de la racine du monorepo
const here = path.dirname(fileURLToPath(import.meta.url));
dotenv.config({ path: path.resolve(here, '../../../../.env') });

const bool = (def: boolean) =>
  z
    .string()
    .optional()
    .transform((v) => (v === undefined ? def : v === 'true' || v === '1'));

const envSchema = z.object({
  NODE_ENV: z.enum(['development', 'test', 'production']).default('development'),

  DATABASE_URL: z.string().min(1),
  REDIS_URL: z.string().default('redis://localhost:6380'),

  API_PORT: z.coerce.number().default(4000),
  API_HOST: z.string().default('0.0.0.0'),
  API_PUBLIC_URL: z.string().default('http://localhost:4000'),
  WEB_PUBLIC_URL: z.string().default('http://localhost:3000'),
  CORS_ORIGINS: z.string().default('http://localhost:3000'),

  JWT_ACCESS_SECRET: z.string().min(16),
  JWT_REFRESH_SECRET: z.string().min(16),
  JWT_ACCESS_TTL: z.string().default('15m'),
  JWT_REFRESH_TTL_DAYS: z.coerce.number().default(30),
  COOKIE_DOMAIN: z.string().default('localhost'),
  COOKIE_SECURE: bool(false),

  GOOGLE_CLIENT_ID: z.string().default(''),
  GOOGLE_CLIENT_SECRET: z.string().default(''),
  GOOGLE_CALLBACK_URL: z.string().default('http://localhost:4000/api/v1/auth/oauth/google/callback'),

  SMTP_HOST: z.string().default('localhost'),
  SMTP_PORT: z.coerce.number().default(1025),
  SMTP_USER: z.string().default(''),
  SMTP_PASS: z.string().default(''),
  MAIL_FROM: z.string().default('Kelvyn Tube <no-reply@kelvyntube.local>'),

  S3_ENDPOINT: z.string().default('http://localhost:9000'),
  S3_REGION: z.string().default('auto'),
  S3_ACCESS_KEY_ID: z.string().default('kelvyntube'),
  S3_SECRET_ACCESS_KEY: z.string().default('kelvyntube-secret'),
  S3_BUCKET: z.string().default('kelvyntube'),
  S3_FORCE_PATH_STYLE: bool(true),
  CDN_PUBLIC_URL: z.string().default('http://localhost:9000/kelvyntube'),

  MEILI_HOST: z.string().default('http://localhost:7700'),
  MEILI_MASTER_KEY: z.string().default('kelvyntube-meili-master-key'),

  FFMPEG_PATH: z.string().default('ffmpeg'),
  FFPROBE_PATH: z.string().default('ffprobe'),
  TRANSCODE_TMP_DIR: z.string().default('./tmp/transcode'),
  TRANSCODE_CONCURRENCY: z.coerce.number().default(2),
  MAX_RENDITION: z.string().default('1080p'),

  VIEW_MIN_WATCH_SECONDS: z.coerce.number().default(5),
  VIEW_DEDUPE_WINDOW_SECONDS: z.coerce.number().default(1800),
  VIEW_FLUSH_INTERVAL_MS: z.coerce.number().default(15000),

  /** Sel du hachage d'IP pour le comptage de vues (RGPD : jamais d'IP en clair). */
  IP_HASH_SALT: z.string().default('kelvyntube-ip-salt-dev'),
});

const parsed = envSchema.safeParse(process.env);

if (!parsed.success) {
  console.error('❌ Variables d\'environnement invalides :');
  console.error(parsed.error.flatten().fieldErrors);
  process.exit(1);
}

export const env = parsed.data;

export const isDev = env.NODE_ENV === 'development';
export const isProd = env.NODE_ENV === 'production';

export const corsOrigins = env.CORS_ORIGINS.split(',').map((o) => o.trim()).filter(Boolean);

/** Google OAuth activé uniquement si les identifiants sont fournis. */
export const googleOAuthEnabled = Boolean(env.GOOGLE_CLIENT_ID && env.GOOGLE_CLIENT_SECRET);
