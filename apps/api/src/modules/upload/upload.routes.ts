import type { FastifyInstance, FastifyRequest } from 'fastify';
import {
  API_PREFIX,
  ROUTES,
  uploadCompleteSchema,
  uploadInitSchema,
} from '@kelvyntube/shared';
import { AppError, badRequest, unauthorized } from '../../lib/errors.js';
import {
  MAX_CHUNK_BYTES,
  abortUpload,
  completeUpload,
  getUploadStatus,
  initUpload,
  receiveChunk,
} from './upload.service.js';

/**
 * ═══════════════════════════════════════════════════════════════════════════
 *  MODULE UPLOAD — upload resumable par chunks
 *
 *   POST   /upload/init                  → ouvre une session + multipart S3
 *   PUT    /upload/:uploadId/chunk/:index→ envoie le chunk N (désordre permis)
 *   GET    /upload/:uploadId/status      → reprise après coupure réseau
 *   POST   /upload/:uploadId/complete    → assemble et lance le transcodage
 *   DELETE /upload/:uploadId             → abandonne tout
 *
 *  Toutes les routes exigent un utilisateur connecté ; le service vérifie en
 *  plus que la session appartient à une chaîne possédée par cet utilisateur.
 * ═══════════════════════════════════════════════════════════════════════════
 */

/** Fastify a besoin des chemins paramétrés ; `ROUTES.upload.*` fournit la forme. */
const CHUNK_PATH = `${API_PREFIX}/upload/:uploadId/chunk/:index`;

interface UploadParams {
  uploadId: string;
}

interface ChunkParams extends UploadParams {
  index: string;
}

/** `app.authenticate` garantit déjà la présence de l'utilisateur ; ceci rassure TypeScript. */
function requireUser(req: FastifyRequest) {
  if (!req.user) throw unauthorized();
  return req.user;
}

/** Une vidéo appartient toujours à une chaîne : sans chaîne active, pas d'upload. */
function requireChannelId(req: FastifyRequest): string {
  const user = requireUser(req);
  if (!user.cid) {
    throw badRequest("Aucune chaîne active : créez une chaîne avant de publier une vidéo");
  }
  return user.cid;
}

/** Récupère le corps binaire du chunk, que le client envoie en multipart ou en brut. */
async function readChunkBody(req: FastifyRequest): Promise<Buffer> {
  if (req.isMultipart()) {
    try {
      const file = await req.file();
      if (!file) throw badRequest('Aucun fichier trouvé dans la requête multipart');
      return await file.toBuffer();
    } catch (err) {
      if (err instanceof AppError) throw err;
      // @fastify/multipart lève une erreur dédiée au dépassement de `fileSize`.
      const code = (err as { code?: string }).code;
      if (code === 'FST_REQ_FILE_TOO_LARGE' || code === 'FST_PARTS_LIMIT') {
        throw new AppError(413, 'PAYLOAD_TOO_LARGE', 'Chunk trop volumineux (maximum 200 Mo)');
      }
      throw err;
    }
  }
  const body: unknown = req.body;
  if (Buffer.isBuffer(body)) return body;
  if (typeof body === 'string') return Buffer.from(body, 'binary');
  throw badRequest('Corps binaire attendu (application/octet-stream ou multipart/form-data)');
}

export async function registerUploadRoutes(app: FastifyInstance) {
  // ── Routes JSON ─────────────────────────────────────────────────────────
  await app.register(async (scope) => {
    /** POST /upload/init — ouvre la session d'upload. */
    scope.post(
      ROUTES.upload.init,
      {
        preHandler: [app.authenticate],
        config: { rateLimit: { max: 60, timeWindow: '1 minute' } },
      },
      async (req, reply) => {
        const user = requireUser(req);
        const channelId = requireChannelId(req);
        const input = uploadInitSchema.parse(req.body);
        const result = await initUpload(user.sub, channelId, input);
        return reply.status(201).send(result);
      },
    );

    /** GET /upload/:uploadId/status — permet au client de reprendre où il s'était arrêté. */
    scope.get(
      ROUTES.upload.status(':uploadId'),
      { preHandler: [app.authenticate] },
      async (req) => {
        const user = requireUser(req);
        const { uploadId } = req.params as UploadParams;
        return getUploadStatus(uploadId, user.sub);
      },
    );

    /** POST /upload/:uploadId/complete — assemble les parts et enfile le transcodage. */
    scope.post(
      ROUTES.upload.complete(':uploadId'),
      { preHandler: [app.authenticate] },
      async (req) => {
        const user = requireUser(req);
        const { uploadId } = req.params as UploadParams;
        // Le contrat partagé attend `{ uploadId }` : on valide la cohérence
        // entre le corps (optionnel) et le paramètre d'URL.
        const body = (req.body ?? {}) as Record<string, unknown>;
        const parsed = uploadCompleteSchema.parse({ uploadId: body.uploadId ?? uploadId });
        if (parsed.uploadId !== uploadId) {
          throw badRequest("L'identifiant d'upload du corps ne correspond pas à celui de l'URL");
        }
        return completeUpload(uploadId, user.sub);
      },
    );

    /** DELETE /upload/:uploadId — abandon : abort S3 + suppression vidéo/session. */
    scope.delete(
      ROUTES.upload.abort(':uploadId'),
      { preHandler: [app.authenticate] },
      async (req, reply) => {
        const user = requireUser(req);
        const { uploadId } = req.params as UploadParams;
        await abortUpload(uploadId, user.sub);
        return reply.status(204).send();
      },
    );
  });

  // ── Route binaire (chunk) ───────────────────────────────────────────────
  // Encapsulée dans son propre scope : les parseurs de contenu ajoutés ici
  // n'affectent pas les autres modules.
  await app.register(async (scope) => {
    const passthrough = (
      _req: FastifyRequest,
      body: Buffer,
      done: (err: Error | null, body?: Buffer) => void,
    ) => done(null, body);

    scope.addContentTypeParser<Buffer>(
      ['application/octet-stream', 'binary/octet-stream', 'application/x-binary'],
      { parseAs: 'buffer', bodyLimit: MAX_CHUNK_BYTES },
      passthrough,
    );
    // Certains clients envoient le type MIME du fichier source sur chaque chunk.
    scope.addContentTypeParser<Buffer>(
      /^video\//,
      { parseAs: 'buffer', bodyLimit: MAX_CHUNK_BYTES },
      passthrough,
    );

    /**
     * PUT /upload/:uploadId/chunk/:index
     * Idempotent : un chunk déjà reçu renvoie 200 avec l'état courant.
     * Les chunks peuvent arriver dans n'importe quel ordre.
     */
    scope.put(
      CHUNK_PATH,
      { preHandler: [app.authenticate], bodyLimit: MAX_CHUNK_BYTES },
      async (req) => {
        const user = requireUser(req);
        const { uploadId, index } = req.params as ChunkParams;
        const chunkIndex = Number(index);
        if (!Number.isInteger(chunkIndex) || chunkIndex < 0) {
          throw badRequest('Index de chunk invalide');
        }
        const buffer = await readChunkBody(req);
        return receiveChunk(uploadId, user.sub, chunkIndex, buffer);
      },
    );
  });
}
