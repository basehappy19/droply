import { deleteStoredFile } from './files.js';
import { K, redis } from './redis.js';
import { destroyRoom } from './rooms.js';

/**
 * One pass of the cleanup worker. Safe to run from several processes at once:
 * an entry is only processed by whoever manages to ZREM it.
 */
export async function runCleanupOnce(now = Date.now()) {
  const dueRooms = await redis.zrangebyscore(K.expiries, 0, now, 'LIMIT', 0, 200);
  for (const id of dueRooms) {
    if ((await redis.zrem(K.expiries, id)) !== 1) continue;
    const [expiresAtRaw, emptySince] = await redis.hmget(K.room(id), 'expiresAt', 'emptySince');
    const expiresAt = Number(expiresAtRaw);
    const expired = !expiresAt || expiresAt <= now + 1000;
    if (!expired && !emptySince) {
      // Someone reconnected between scheduling and now — put the hard deadline back.
      await redis.zadd(K.expiries, expiresAt, id);
      continue;
    }
    await destroyRoom(id, expired ? 'expired' : 'empty');
  }

  const dueFiles = await redis.zrangebyscore(K.fileDeletes, 0, now, 'LIMIT', 0, 200);
  for (const entry of dueFiles) {
    if ((await redis.zrem(K.fileDeletes, entry)) !== 1) continue;
    const [roomId, fileId] = entry.split('|');
    await deleteStoredFile(roomId, fileId).catch((err) => console.error('[cleanup] file delete failed', entry, err));
  }
  return { rooms: dueRooms.length, files: dueFiles.length };
}

export function startCleanupLoop(intervalMs = 30_000) {
  let running = false;
  const tick = async () => {
    if (running) return;
    running = true;
    try {
      await runCleanupOnce();
    } catch (err) {
      console.error('[cleanup] pass failed', err);
    } finally {
      running = false;
    }
  };
  void tick();
  return setInterval(tick, intervalMs);
}
