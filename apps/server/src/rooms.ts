import { config } from './config.js';
import { ENDED_CHANNEL, K, redis, roomKeys } from './redis.js';
import { storage } from './storage.js';
import { clampStr, hashPassword, normalizeCode, randomCode, randomId, sha256, verifyPassword } from './util.js';
import { checkJoinLock, recordJoinFailure } from './ratelimit.js';
import { AppError } from './errors.js';
export { AppError };

export interface RoomInfo {
  id: string;
  code: string;
  createdAt: number;
  expiresAt: number;
  ttl: number;
  emptyDelete: boolean;
  /** When the room became empty (ms) — only tracked when emptyDelete is on. */
  emptySince: number | null;
  hasPassword: boolean;
  locked: boolean;
  allowAllNuke: boolean;
  ownerOnlySend: boolean;
  bytesUsed: number;
}

export interface Member {
  id: string;
  name: string;
  os: string;
  browser: string;
  isOwner: boolean;
  joinedAt: number;
}

export interface FileMeta {
  id: string;
  name: string;
  size: number;
  type: string;
  thumb?: string;
  status: 'ready' | 'burned';
}

export interface Message {
  id: string;
  kind: 'text' | 'code' | 'file';
  from: string;
  fromName: string;
  at: number;
  body?: string;
  lang?: string;
  file?: FileMeta;
  /** Burn-after-reading: total allowed opens and how many remain. */
  burn?: { max: number; left: number };
}

export interface Session {
  roomId: string;
  sessionId: string;
  member: Member;
  room: RoomInfo;
}


/* ---------------- helpers ---------------- */

function parseRoom(id: string, h: Record<string, string>): RoomInfo | null {
  if (!h.code) return null;
  return {
    id,
    code: h.code,
    createdAt: Number(h.createdAt),
    expiresAt: Number(h.expiresAt),
    ttl: Number(h.ttl),
    emptyDelete: h.emptyDelete === '1',
    emptySince: h.emptySince ? Number(h.emptySince) : null,
    hasPassword: !!h.pwHash,
    locked: h.locked === '1',
    allowAllNuke: h.allowAllNuke === '1',
    ownerOnlySend: h.ownerOnlySend === '1',
    bytesUsed: Number(h.bytesUsed ?? 0),
  };
}

export async function loadRoom(id: string): Promise<RoomInfo | null> {
  const room = parseRoom(id, await redis.hgetall(K.room(id)));
  return room && room.expiresAt > Date.now() ? room : null;
}

/** Re-apply the room's absolute expiry to keys a write may have just created. */
async function expireKeys(roomId: string, expiresAt: number, keys = roomKeys(roomId)) {
  const m = redis.multi();
  for (const k of keys) m.pexpireat(k, expiresAt);
  await m.exec();
}

function sanitizeDevice(d: unknown): { os: string; browser: string } {
  const o = (d ?? {}) as Record<string, unknown>;
  return { os: clampStr(o.os, 24) || 'อุปกรณ์', browser: clampStr(o.browser, 24) || 'เบราว์เซอร์' };
}

async function addMember(room: RoomInfo, device: unknown, isOwner: boolean) {
  const count = await redis.hlen(K.members(room.id));
  if (count >= config.limits.maxMembers) throw new AppError('room_full', 409);

  const { os, browser } = sanitizeDevice(device);
  const existing = (await redis.hvals(K.members(room.id))).map((j) => JSON.parse(j) as Member);
  const base = `${browser} บน ${os}`;
  const same = existing.filter((m) => m.name === base || m.name.startsWith(`${base} #`)).length;
  const member: Member = { id: randomId(9), name: same ? `${base} #${same + 1}` : base, os, browser, isOwner, joinedAt: Date.now() };

  // Session tokens embed the room id so a single token is enough to authenticate.
  const sessionToken = `${room.id}.${randomId(24)}`;
  await redis
    .multi()
    .hset(K.members(room.id), member.id, JSON.stringify(member))
    .hset(K.sessions(room.id), sha256(sessionToken), member.id)
    .exec();
  await expireKeys(room.id, room.expiresAt, [K.members(room.id), K.sessions(room.id)]);
  return { member, sessionToken };
}

/* ---------------- create / join ---------------- */

export async function createRoom(input: { ttl?: unknown; emptyDelete?: unknown; password?: unknown; device?: unknown }) {
  const ttl = config.limits.ttlOptions.includes(Number(input.ttl)) ? Number(input.ttl) : config.limits.defaultTtl;
  const password = clampStr(input.password, 128);
  const now = Date.now();
  const expiresAt = now + ttl * 1000;
  const id = randomId(16);

  let code = '';
  for (let i = 0; i < 20 && !code; i++) {
    const c = randomCode();
    if (await redis.set(K.code(c), id, 'PXAT', expiresAt, 'NX')) code = c;
  }
  if (!code) throw new AppError('code_exhausted', 503);

  const ownerToken = randomId(24);
  const emptyDelete = input.emptyDelete === true;
  const fields: Record<string, string | number> = {
    code,
    createdAt: now,
    expiresAt,
    ttl,
    emptyDelete: emptyDelete ? 1 : 0,
    ownerHash: sha256(ownerToken),
    locked: 0,
    allowAllNuke: 0,
    ownerOnlySend: 0,
    bytesUsed: 0,
  };
  if (password) fields.pwHash = await hashPassword(password);
  // An empty-delete room starts its grace timer immediately, until the first device connects.
  if (emptyDelete) fields.emptySince = now;

  await redis
    .multi()
    .hset(K.room(id), fields)
    .pexpireat(K.room(id), expiresAt)
    .zadd(K.expiries, emptyDelete ? Math.min(expiresAt, now + config.limits.emptyGraceSec * 1000) : expiresAt, id)
    .exec();

  const room = (await loadRoom(id))!;
  const { member, sessionToken } = await addMember(room, input.device, true);
  return { room, member, sessionToken, ownerToken };
}

export async function joinRoom(
  input: { code?: unknown; password?: unknown; ownerToken?: unknown; sessionToken?: unknown; device?: unknown },
  ip: string,
) {
  // Re-joining with a valid session (page refresh) keeps the same device identity.
  if (typeof input.sessionToken === 'string') {
    const s = await getSession(input.sessionToken);
    if (s && (!input.code || normalizeCode(input.code) === s.room.code)) {
      if (typeof input.ownerToken === 'string' && !s.member.isOwner) await promoteOwner(s, input.ownerToken);
      return { room: s.room, member: s.member, sessionToken: input.sessionToken };
    }
  }

  await checkJoinLock(ip);
  const code = normalizeCode(input.code);
  const id = code ? await redis.get(K.code(code)) : null;
  const room = id ? await loadRoom(id) : null;
  if (!room) {
    await recordJoinFailure(ip);
    throw new AppError('not_found', 404);
  }

  const isOwner = typeof input.ownerToken === 'string' && (await redis.hget(K.room(room.id), 'ownerHash')) === sha256(input.ownerToken);
  if (room.locked && !isOwner) throw new AppError('locked', 423);

  if (room.hasPassword && !isOwner) {
    const password = clampStr(input.password, 128);
    if (!password) throw new AppError('password_required', 401);
    const ok = await verifyPassword(password, (await redis.hget(K.room(room.id), 'pwHash')) ?? '');
    if (!ok) {
      await recordJoinFailure(ip);
      throw new AppError('wrong_password', 401);
    }
  }

  const { member, sessionToken } = await addMember(room, input.device, isOwner);
  return { room, member, sessionToken };
}

async function promoteOwner(s: Session, ownerToken: string) {
  if ((await redis.hget(K.room(s.roomId), 'ownerHash')) !== sha256(ownerToken)) return;
  s.member.isOwner = true;
  await redis.hset(K.members(s.roomId), s.sessionId, JSON.stringify(s.member));
}

export async function getSession(token: unknown): Promise<Session | null> {
  if (typeof token !== 'string') return null;
  const roomId = token.split('.')[0];
  if (!roomId) return null;
  const room = await loadRoom(roomId);
  if (!room) return null;
  const sessionId = await redis.hget(K.sessions(roomId), sha256(token));
  if (!sessionId) return null;
  const raw = await redis.hget(K.members(roomId), sessionId);
  if (!raw) return null;
  return { roomId, sessionId, member: JSON.parse(raw) as Member, room };
}

export async function renameMember(s: Session, name: unknown) {
  const n = clampStr(name, 40).trim();
  if (!n) throw new AppError('invalid_name');
  s.member.name = n;
  await redis.hset(K.members(s.roomId), s.sessionId, JSON.stringify(s.member));
}

/** Explicit "leave room": forget this device. */
export async function leaveRoom(s: Session, token: string) {
  await redis.multi().hdel(K.members(s.roomId), s.sessionId).hdel(K.sessions(s.roomId), sha256(token)).exec();
}

/* ---------------- presence & empty-room timer ---------------- */

export async function onlineMembers(roomId: string): Promise<Member[]> {
  const conns = await redis.hgetall(K.conns(roomId));
  const ids = Object.keys(conns).filter((k) => Number(conns[k]) > 0);
  if (!ids.length) return [];
  const raws = await redis.hmget(K.members(roomId), ...ids);
  return raws.filter((r): r is string => !!r).map((r) => JSON.parse(r) as Member);
}

export async function markConnected(s: Session) {
  await redis.hincrby(K.conns(s.roomId), s.sessionId, 1);
  await expireKeys(s.roomId, s.room.expiresAt, [K.conns(s.roomId)]);
  if (s.room.emptyDelete && s.room.emptySince) {
    await redis.multi().hdel(K.room(s.roomId), 'emptySince').zadd(K.expiries, s.room.expiresAt, s.roomId).exec();
  }
}

export async function markDisconnected(s: Session) {
  const left = await redis.hincrby(K.conns(s.roomId), s.sessionId, -1);
  if (left <= 0) await redis.hdel(K.conns(s.roomId), s.sessionId);
  const room = await loadRoom(s.roomId);
  if (!room?.emptyDelete) return;
  if ((await redis.hlen(K.conns(s.roomId))) === 0) {
    const now = Date.now();
    await redis
      .multi()
      .hset(K.room(s.roomId), 'emptySince', now)
      .zadd(K.expiries, Math.min(room.expiresAt, now + config.limits.emptyGraceSec * 1000), s.roomId)
      .exec();
  }
}

/* ---------------- messages ---------------- */

export async function listMessages(roomId: string): Promise<Message[]> {
  const ids = await redis.lrange(K.order(roomId), 0, -1);
  if (!ids.length) return [];
  const [raws, burns] = await Promise.all([redis.hmget(K.msgs(roomId), ...ids), redis.hmget(K.burn(roomId), ...ids)]);
  return raws.flatMap((raw, i) => {
    if (!raw) return [];
    const m = JSON.parse(raw) as Message;
    if (m.burn) m.burn.left = Math.max(0, Number(burns[i] ?? 0));
    return [m];
  });
}

async function canSend(s: Session) {
  if (s.room.ownerOnlySend && !s.member.isOwner) throw new AppError('broadcast_only');
  if ((await redis.llen(K.order(s.roomId))) >= config.limits.maxMessages) throw new AppError('too_many_messages');
}

function parseBurn(v: unknown): number {
  const n = Math.floor(Number(v));
  return Number.isFinite(n) && n >= 1 ? Math.min(n, config.limits.maxBurnCount) : 0;
}

export async function addTextMessage(s: Session, input: { kind?: unknown; body?: unknown; lang?: unknown; burn?: unknown }) {
  await canSend(s);
  const body = typeof input.body === 'string' ? input.body : '';
  if (!body.trim()) throw new AppError('empty');
  if (Buffer.byteLength(body) > config.limits.maxMessageBytes) throw new AppError('too_large');

  const burn = parseBurn(input.burn);
  const msg: Message = {
    id: randomId(9),
    kind: input.kind === 'code' ? 'code' : 'text',
    from: s.sessionId,
    fromName: s.member.name,
    at: Date.now(),
    lang: input.kind === 'code' ? clampStr(input.lang, 24) || undefined : undefined,
  };
  const m = redis.multi();
  if (burn) {
    msg.burn = { max: burn, left: burn };
    m.hset(K.secret(s.roomId), msg.id, body).hset(K.burn(s.roomId), msg.id, burn);
  } else {
    msg.body = body;
  }
  await m.hset(K.msgs(s.roomId), msg.id, JSON.stringify(msg)).rpush(K.order(s.roomId), msg.id).exec();
  await expireKeys(s.roomId, s.room.expiresAt);
  return msg;
}

/** Opens a burn-after-reading text message: decrements atomically, deletes the text on the last open. */
export async function revealMessage(s: Session, msgId: unknown) {
  if (typeof msgId !== 'string') throw new AppError('not_found', 404);
  const left = await redis.hincrby(K.burn(s.roomId), msgId, -1);
  if (left < 0) {
    await redis.hset(K.burn(s.roomId), msgId, 0);
    throw new AppError('burned', 410);
  }
  const body = await redis.hget(K.secret(s.roomId), msgId);
  if (left === 0) await redis.hdel(K.secret(s.roomId), msgId);
  if (body == null) throw new AppError('burned', 410);
  return { body, left };
}

export async function deleteMessage(s: Session, msgId: unknown) {
  if (typeof msgId !== 'string') throw new AppError('not_found', 404);
  const raw = await redis.hget(K.msgs(s.roomId), msgId);
  if (!raw) throw new AppError('not_found', 404);
  const msg = JSON.parse(raw) as Message;
  if (msg.from !== s.sessionId && !s.member.isOwner) throw new AppError('forbidden', 403);
  await redis.multi().hdel(K.msgs(s.roomId), msgId).lrem(K.order(s.roomId), 0, msgId).hdel(K.secret(s.roomId), msgId).hdel(K.burn(s.roomId), msgId).exec();
  if (msg.file) await scheduleFileDelete(s.roomId, msg.file.id, 0);
  return msg;
}

/* ---------------- room settings / nuke ---------------- */

export async function updateSettings(s: Session, input: { locked?: unknown; allowAllNuke?: unknown; ownerOnlySend?: unknown }) {
  if (!s.member.isOwner) throw new AppError('forbidden', 403);
  const patch: Record<string, number> = {};
  for (const k of ['locked', 'allowAllNuke', 'ownerOnlySend'] as const) if (typeof input[k] === 'boolean') patch[k] = input[k] ? 1 : 0;
  if (Object.keys(patch).length) await redis.hset(K.room(s.roomId), patch);
  return (await loadRoom(s.roomId))!;
}

export function canNuke(s: Session) {
  return s.member.isOwner || s.room.allowAllNuke;
}

/** Deletes everything about a room: Redis keys now, stored files right after. */
export async function destroyRoom(roomId: string, reason: 'expired' | 'empty' | 'nuked') {
  const code = await redis.hget(K.room(roomId), 'code');
  const m = redis.multi().del(...roomKeys(roomId)).zrem(K.expiries, roomId);
  if (code) m.del(K.code(code));
  await m.exec();
  await redis.publish(ENDED_CHANNEL, JSON.stringify({ roomId, reason }));
  await storage.deletePrefix(`rooms/${roomId}/`).catch((err) => console.error('[cleanup] storage delete failed', roomId, err));
}

/** Queue a stored file for deletion after `delaySec` (gives in-flight downloads time to finish). */
export async function scheduleFileDelete(roomId: string, fileId: string, delaySec: number) {
  await redis.zadd(K.fileDeletes, Date.now() + delaySec * 1000, `${roomId}|${fileId}`);
}
