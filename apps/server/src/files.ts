import { config } from './config.js';
import { AppError } from './errors.js';
import { reserveUploadBytes } from './ratelimit.js';
import { K, redis } from './redis.js';
import { scheduleFileDelete, type Message, type Session } from './rooms.js';
import { storage } from './storage.js';
import { canInline, clampStr, randomId, safeContentType } from './util.js';

interface FileRecord {
  id: string;
  key: string;
  uploadId: string;
  name: string;
  size: number;
  type: string;
  sender: string;
  partCount: number;
  status: 'uploading' | 'ready' | 'burned';
  msgId?: string;
}

const L = config.limits;

async function getRecord(roomId: string, fileId: unknown): Promise<FileRecord> {
  if (typeof fileId !== 'string') throw new AppError('not_found', 404);
  const raw = await redis.hget(K.files(roomId), fileId);
  if (!raw) throw new AppError('not_found', 404);
  return JSON.parse(raw) as FileRecord;
}

const saveRecord = (roomId: string, r: FileRecord) => redis.hset(K.files(roomId), r.id, JSON.stringify(r));

export async function initUpload(s: Session, input: { name?: unknown; size?: unknown; type?: unknown }, ip: string) {
  if (s.room.ownerOnlySend && !s.member.isOwner) throw new AppError('broadcast_only');
  if ((await redis.llen(K.order(s.roomId))) >= L.maxMessages) throw new AppError('too_many_messages');

  const size = Math.floor(Number(input.size));
  if (!Number.isFinite(size) || size <= 0) throw new AppError('invalid_size');
  if (size > L.maxFileBytes) throw new AppError('file_too_large', 413);

  // Reserve room capacity atomically; roll back if it would overflow.
  const used = await redis.hincrby(K.room(s.roomId), 'bytesUsed', size);
  if (used > L.maxRoomBytes) {
    await redis.hincrby(K.room(s.roomId), 'bytesUsed', -size);
    throw new AppError('room_storage_full', 413);
  }
  try {
    await reserveUploadBytes(ip, size);
  } catch (e) {
    await redis.hincrby(K.room(s.roomId), 'bytesUsed', -size);
    throw e;
  }

  const id = randomId(12);
  const key = `rooms/${s.roomId}/${id}`;
  const type = safeContentType(input.type);
  const partCount = Math.ceil(size / L.partSize);
  const { uploadId, urls } = await storage.initUpload(key, type, partCount);

  const record: FileRecord = {
    id,
    key,
    uploadId,
    name: clampStr(input.name, 200).replace(/[\\/\0]/g, '_') || 'file',
    size,
    type,
    sender: s.sessionId,
    partCount,
    status: 'uploading',
  };
  await saveRecord(s.roomId, record);
  await redis.pexpireat(K.files(s.roomId), s.room.expiresAt);
  return { fileId: id, partSize: L.partSize, urls };
}

const THUMB_RE = /^data:image\/(webp|jpeg|png);base64,[A-Za-z0-9+/=]+$/;

export async function completeUpload(s: Session, input: { fileId?: unknown; parts?: unknown; thumb?: unknown; burn?: unknown }) {
  const r = await getRecord(s.roomId, input.fileId);
  if (r.sender !== s.sessionId || r.status !== 'uploading') throw new AppError('forbidden', 403);

  const parts = Array.isArray(input.parts)
    ? input.parts.map((p) => ({ n: Number((p as { n: unknown }).n), etag: String((p as { etag: unknown }).etag) }))
    : [];
  const nums = new Set(parts.map((p) => p.n));
  if (parts.length !== r.partCount || nums.size !== r.partCount || ![...nums].every((n) => n >= 1 && n <= r.partCount)) {
    throw new AppError('incomplete_upload');
  }
  await storage.complete(r.key, r.uploadId, parts);

  const thumb = typeof input.thumb === 'string' && input.thumb.length <= L.maxThumbBytes * 1.4 && THUMB_RE.test(input.thumb) ? input.thumb : undefined;
  const burnN = Math.floor(Number(input.burn));
  const burn = Number.isFinite(burnN) && burnN >= 1 ? Math.min(burnN, L.maxBurnCount) : 0;

  const msg: Message = {
    id: randomId(9),
    kind: 'file',
    from: s.sessionId,
    fromName: s.member.name,
    at: Date.now(),
    file: { id: r.id, name: r.name, size: r.size, type: r.type, thumb: burn ? undefined : thumb, status: 'ready' },
  };
  r.status = 'ready';
  r.msgId = msg.id;

  const m = redis.multi().hset(K.files(s.roomId), r.id, JSON.stringify(r)).hset(K.msgs(s.roomId), msg.id, JSON.stringify(msg)).rpush(K.order(s.roomId), msg.id);
  if (burn) {
    msg.burn = { max: burn, left: burn };
    m.hset(K.msgs(s.roomId), msg.id, JSON.stringify(msg)).hset(K.burn(s.roomId), msg.id, burn);
  }
  await m.exec();
  for (const k of [K.msgs(s.roomId), K.order(s.roomId), K.burn(s.roomId)]) await redis.pexpireat(k, s.room.expiresAt);
  return msg;
}

export async function abortUpload(s: Session, input: { fileId?: unknown }) {
  const r = await getRecord(s.roomId, input.fileId);
  if (r.sender !== s.sessionId || r.status !== 'uploading') throw new AppError('forbidden', 403);
  await storage.abort(r.key, r.uploadId);
  await redis.multi().hdel(K.files(s.roomId), r.id).hincrby(K.room(s.roomId), 'bytesUsed', -r.size).exec();
}

/**
 * Issues a short-lived URL for a file. For burn-after-download files every URL counts as one
 * download (decremented atomically); the last one marks the message burned and schedules deletion.
 */
export async function fileUrl(s: Session, input: { fileId?: unknown; inline?: unknown }) {
  const r = await getRecord(s.roomId, input.fileId);
  if (r.status !== 'ready' || !r.msgId) throw new AppError('burned', 410);

  let burnUpdate: { msgId: string; left: number } | null = null;
  const raw = await redis.hget(K.msgs(s.roomId), r.msgId);
  const msg = raw ? (JSON.parse(raw) as Message) : null;
  if (msg?.burn) {
    const left = await redis.hincrby(K.burn(s.roomId), msg.id, -1);
    if (left < 0) {
      await redis.hset(K.burn(s.roomId), msg.id, 0);
      throw new AppError('burned', 410);
    }
    burnUpdate = { msgId: msg.id, left };
    if (left === 0) {
      r.status = 'burned';
      msg.file!.status = 'burned';
      await redis.multi().hset(K.files(s.roomId), r.id, JSON.stringify(r)).hset(K.msgs(s.roomId), msg.id, JSON.stringify(msg)).exec();
      // Keep the object long enough for this last download to finish, then delete it.
      await scheduleFileDelete(s.roomId, r.id, 15 * 60);
    }
  }

  const inline = input.inline === true && !msg?.burn && canInline(r.type);
  const url = await storage.getUrl(r.key, { filename: r.name, contentType: r.type, inline, expiresSec: L.downloadUrlSec });
  return { url, burnUpdate };
}

/** Deletes one stored file (used for burned/deleted messages). */
export async function deleteStoredFile(roomId: string, fileId: string) {
  const raw = await redis.hget(K.files(roomId), fileId);
  await storage.deletePrefix(`rooms/${roomId}/${fileId}`);
  if (raw && (await redis.exists(K.room(roomId)))) {
    const r = JSON.parse(raw) as FileRecord;
    await redis.multi().hdel(K.files(roomId), fileId).hincrby(K.room(roomId), 'bytesUsed', -r.size).exec();
  }
}
