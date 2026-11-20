import { createHash, createHmac, randomBytes, scrypt as scryptCb, timingSafeEqual } from 'node:crypto';
import { promisify } from 'node:util';
import { config } from './config.js';
import { WORDS } from './words.js';

const scrypt = promisify(scryptCb) as (pw: string, salt: Buffer, len: number) => Promise<Buffer>;

/** 128-bit+ random identifier, URL-safe. */
export const randomId = (bytes = 16) => randomBytes(bytes).toString('base64url');

export const sha256 = (s: string) => createHash('sha256').update(s).digest('base64url');

export const hmac = (s: string) => createHmac('sha256', config.secret).update(s).digest('base64url');

/** Hash an IP with a per-day salt so rate-limit keys never hold the raw address. */
export const ipKey = (ip: string) => {
  const day = new Date().toISOString().slice(0, 10);
  return hmac(`${day}|${ip}`).slice(0, 22);
};

export function randomCode(): string {
  const word = WORDS[randomBytes(2).readUInt16BE() % WORDS.length].toUpperCase();
  const digits = String(randomBytes(2).readUInt16BE() % 1000).padStart(3, '0');
  return `${word}-${digits}`;
}

/** Accepts "fox882", "Fox-882", " fox 882 " → "FOX-882". Returns null when not a valid code. */
export function normalizeCode(input: unknown): string | null {
  if (typeof input !== 'string') return null;
  const m = input.toUpperCase().replace(/[\s_]/g, '').match(/^([A-Z]{3,5})-?(\d{3})$/);
  return m ? `${m[1]}-${m[2]}` : null;
}

export async function hashPassword(pw: string): Promise<string> {
  const salt = randomBytes(16);
  const key = await scrypt(pw, salt, 32);
  return `scrypt$${salt.toString('base64url')}$${key.toString('base64url')}`;
}

export async function verifyPassword(pw: string, stored: string): Promise<boolean> {
  const [, saltB64, keyB64] = stored.split('$');
  if (!saltB64 || !keyB64) return false;
  const key = await scrypt(pw, Buffer.from(saltB64, 'base64url'), 32);
  const expected = Buffer.from(keyB64, 'base64url');
  return expected.length === key.length && timingSafeEqual(expected, key);
}

/** Signed, expiring token for local-storage URLs. */
export function signToken(payload: object): string {
  const body = Buffer.from(JSON.stringify(payload)).toString('base64url');
  return `${body}.${hmac(body)}`;
}

export function readToken<T extends { exp: number }>(token: unknown): T | null {
  if (typeof token !== 'string') return null;
  const [body, sig] = token.split('.');
  if (!body || !sig) return null;
  const expected = hmac(body);
  if (expected.length !== sig.length || !timingSafeEqual(Buffer.from(expected), Buffer.from(sig))) return null;
  try {
    const data = JSON.parse(Buffer.from(body, 'base64url').toString()) as T;
    return data.exp > Date.now() ? data : null;
  } catch {
    return null;
  }
}

export const clampStr = (v: unknown, max: number) => (typeof v === 'string' ? v.slice(0, max) : '');

/** RFC 5987 Content-Disposition with a safe ASCII fallback. */
export function contentDisposition(filename: string, inline: boolean): string {
  const ascii = filename.replace(/[^\x20-\x7e]/g, '_').replace(/["\\]/g, '_');
  return `${inline ? 'inline' : 'attachment'}; filename="${ascii}"; filename*=UTF-8''${encodeURIComponent(filename)}`;
}

/** Only media the browser renders safely may be shown inline; everything else downloads. */
export function canInline(contentType: string): boolean {
  return /^(image\/(png|jpeg|gif|webp|avif|bmp)|video\/|audio\/|application\/pdf$)/.test(contentType);
}

export function safeContentType(t: unknown): string {
  return typeof t === 'string' && /^[\w.+-]+\/[\w.+-]+$/.test(t) && t.length < 128 ? t.toLowerCase() : 'application/octet-stream';
}
