import { config } from './config.js';
import { K, redis } from './redis.js';
import { AppError } from './errors.js';
import { ipKey } from './util.js';

const L = config.limits;

/** Throws while an IP is locked out for too many wrong codes/passwords. */
export async function checkJoinLock(ip: string) {
  if (await redis.exists(K.rl('lock', ipKey(ip)))) throw new AppError('rate_limited', 429);
}

export async function recordJoinFailure(ip: string) {
  const who = ipKey(ip);
  const n = await redis.incr(K.rl('jf', who));
  if (n === 1) await redis.expire(K.rl('jf', who), 60);
  if (n >= L.joinFailPerMin) await redis.set(K.rl('lock', who), 1, 'EX', L.joinLockoutSec);
}

export async function checkRoomCreate(ip: string) {
  const key = K.rl('rc', ipKey(ip));
  const n = await redis.incr(key);
  if (n === 1) await redis.expire(key, 60 * 60);
  if (n > L.roomsPerHour) throw new AppError('rate_limited', 429);
}

/** Reserves upload bandwidth for the day; throws when the IP's daily quota would be exceeded. */
export async function reserveUploadBytes(ip: string, bytes: number) {
  const key = K.rl('up', ipKey(ip));
  const total = await redis.incrby(key, bytes);
  if (total === bytes) await redis.expire(key, 24 * 60 * 60);
  if (total > L.uploadBytesPerDay) {
    await redis.decrby(key, bytes);
    throw new AppError('daily_quota', 429);
  }
}
