import { Redis } from 'ioredis';
import { config } from './config.js';

export const redis = new Redis(config.redisUrl, { maxRetriesPerRequest: 3 });
export const createRedis = () => new Redis(config.redisUrl, { maxRetriesPerRequest: null });

/** Every key that belongs to a room, so it can be expired and deleted together. */
export const K = {
  room: (id: string) => `room:${id}`,
  code: (code: string) => `code:${code}`,
  members: (id: string) => `room:${id}:members`, // sessionId -> Member JSON
  sessions: (id: string) => `room:${id}:sessions`, // sessionTokenHash -> sessionId
  conns: (id: string) => `room:${id}:conns`, // sessionId -> open socket count
  msgs: (id: string) => `room:${id}:msgs`, // msgId -> Message JSON
  order: (id: string) => `room:${id}:order`, // list of msgIds
  secret: (id: string) => `room:${id}:secret`, // msgId -> hidden body (burn-after-reading text)
  burn: (id: string) => `room:${id}:burn`, // msgId -> remaining opens
  files: (id: string) => `room:${id}:files`, // fileId -> FileRecord JSON
  expiries: 'expiries', // zset roomId -> deadline (ms)
  fileDeletes: 'file-deletes', // zset "roomId|fileId" -> when to delete (ms)
  rl: (kind: string, who: string) => `rl:${kind}:${who}`,
};

export const roomKeys = (id: string) => [K.room(id), K.members(id), K.sessions(id), K.conns(id), K.msgs(id), K.order(id), K.secret(id), K.burn(id), K.files(id)];

/** Channel used by the cleanup worker to tell API instances a room has ended. */
export const ENDED_CHANNEL = 'droproom:room-ended';
