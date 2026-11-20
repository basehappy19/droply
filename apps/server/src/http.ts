import { createReadStream } from 'node:fs';
import { stat } from 'node:fs/promises';
import { Transform, type Readable } from 'node:stream';
import Fastify, { type FastifyRequest } from 'fastify';
import cors from '@fastify/cors';
import type { Server } from 'socket.io';
import { config } from './config.js';
import { AppError } from './errors.js';
import { abortUpload, completeUpload, fileUrl, initUpload } from './files.js';
import { checkRoomCreate } from './ratelimit.js';
import { createRoom, getSession, joinRoom, type Session } from './rooms.js';
import { isLocal, storage } from './storage.js';
import { contentDisposition, readToken } from './util.js';

export function createApp() {
  const app = Fastify({ logger: { level: process.env.LOG_LEVEL ?? 'info' }, trustProxy: config.trustProxy, bodyLimit: 512 * 1024 });

  // Never log request bodies; only method/url/status (default). Keep content out of logs.
  app.register(cors, {
    origin: config.corsOrigins,
    methods: ['GET', 'POST', 'PUT', 'OPTIONS'],
    exposedHeaders: ['ETag'],
    maxAge: 600,
  });

  app.addHook('onSend', async (_req, reply) => {
    reply.header('X-Robots-Tag', 'noindex, nofollow');
    reply.header('X-Content-Type-Options', 'nosniff');
    reply.header('Referrer-Policy', 'no-referrer');
  });

  // Pass raw bodies through as streams (used by local-storage part uploads).
  app.addContentTypeParser('*', (_req, payload, done) => done(null, payload));

  app.setErrorHandler((err, _req, reply) => {
    if (err instanceof AppError) return reply.status(err.status).send({ error: err.code });
    const status = (err as { statusCode?: number }).statusCode;
    if (status && status < 500) return reply.status(status).send({ error: 'bad_request' });
    app.log.error(err);
    return reply.status(500).send({ error: 'server_error' });
  });

  return app;
}

async function auth(req: FastifyRequest): Promise<Session> {
  const h = req.headers.authorization ?? '';
  const s = await getSession(h.startsWith('Bearer ') ? h.slice(7) : null);
  if (!s) throw new AppError('invalid_session', 401);
  return s;
}

type Body = Record<string, unknown>;

export function registerRoutes(app: ReturnType<typeof createApp>, io: Server) {
  const L = config.limits;

  app.get('/api/health', async () => ({ ok: true }));

  app.get('/api/config', async () => ({
    ttlOptions: L.ttlOptions,
    defaultTtl: L.defaultTtl,
    emptyGraceSec: L.emptyGraceSec,
    maxMembers: L.maxMembers,
    maxMessageBytes: L.maxMessageBytes,
    maxFileBytes: L.maxFileBytes,
    maxRoomBytes: L.maxRoomBytes,
    maxBurnCount: L.maxBurnCount,
    expiringWarnSec: L.expiringWarnSec,
    iceServers: [
      ...(config.ice.stun.length ? [{ urls: config.ice.stun }] : []),
      ...(config.ice.turnUrls.length ? [{ urls: config.ice.turnUrls, username: config.ice.turnUsername, credential: config.ice.turnCredential }] : []),
    ],
  }));

  app.post('/api/rooms', async (req) => {
    await checkRoomCreate(req.ip);
    const { room, member, sessionToken, ownerToken } = await createRoom((req.body ?? {}) as Body);
    return { room, me: member, sessionToken, ownerToken };
  });

  app.post('/api/rooms/join', async (req) => {
    const { room, member, sessionToken } = await joinRoom((req.body ?? {}) as Body, req.ip);
    return { room, me: member, sessionToken };
  });

  /* ---- file uploads (multipart, pre-signed) ---- */

  app.post('/api/files/init', async (req) => initUpload(await auth(req), (req.body ?? {}) as Body, req.ip));

  app.post('/api/files/complete', async (req) => {
    const s = await auth(req);
    const msg = await completeUpload(s, (req.body ?? {}) as Body);
    io.to(s.roomId).emit('msg:new', msg);
    return { id: msg.id };
  });

  app.post('/api/files/abort', async (req) => {
    await abortUpload(await auth(req), (req.body ?? {}) as Body);
    return { ok: true };
  });

  app.post('/api/files/url', async (req) => {
    const s = await auth(req);
    const { url, burnUpdate } = await fileUrl(s, (req.body ?? {}) as Body);
    if (burnUpdate) {
      io.to(s.roomId).emit('msg:update', {
        id: burnUpdate.msgId,
        burn: { left: burnUpdate.left },
        ...(burnUpdate.left === 0 ? { fileStatus: 'burned' } : {}),
      });
    }
    return { url };
  });

  /* ---- local storage endpoints (only when STORAGE=local) ---- */

  if (!isLocal(storage)) return;
  const local = storage;

  app.put('/blob/part', async (req, reply) => {
    const t = readToken<{ k: string; u: string; n: number; exp: number }>((req.query as Body).t);
    if (!t) throw new AppError('invalid_token', 403);
    const len = Number(req.headers['content-length']);
    if (!Number.isFinite(len) || len > L.partSize) throw new AppError('part_too_large', 413);

    let seen = 0;
    const limiter = new Transform({
      transform(chunk: Buffer, _enc, cb) {
        seen += chunk.length;
        cb(seen > L.partSize ? new AppError('part_too_large', 413) : null, chunk);
      },
    });
    const etag = await local.writePart(t.k, t.n, (req.body as Readable).pipe(limiter));
    return reply.header('ETag', etag).status(200).send();
  });

  app.get('/blob/get', async (req, reply) => {
    const t = readToken<{ k: string; fn: string; ct: string; il: boolean; exp: number }>((req.query as Body).t);
    if (!t) throw new AppError('invalid_token', 403);
    const path = local.file(t.k);
    const size = await stat(path).then((s) => s.size).catch(() => -1);
    if (size < 0) throw new AppError('not_found', 404);

    reply
      .header('Content-Type', t.ct)
      .header('Content-Disposition', contentDisposition(t.fn, t.il))
      .header('Content-Security-Policy', "default-src 'none'; img-src 'self'; media-src 'self'; style-src 'unsafe-inline'; sandbox")
      .header('Cache-Control', 'private, no-store')
      .header('Accept-Ranges', 'bytes');

    // Byte ranges are required for video seeking (and for iOS Safari to play video at all).
    const range = /^bytes=(\d*)-(\d*)$/.exec(req.headers.range ?? '');
    if (range && size > 0) {
      let start = range[1] ? Number(range[1]) : size - Number(range[2]);
      let end = range[1] && range[2] ? Number(range[2]) : size - 1;
      start = Math.max(0, start);
      end = Math.min(end, size - 1);
      if (start > end) return reply.status(416).header('Content-Range', `bytes */${size}`).send();
      return reply
        .status(206)
        .header('Content-Range', `bytes ${start}-${end}/${size}`)
        .header('Content-Length', end - start + 1)
        .send(createReadStream(path, { start, end }));
    }
    return reply.header('Content-Length', size).send(createReadStream(path));
  });
}
