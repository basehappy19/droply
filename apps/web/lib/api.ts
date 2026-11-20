import type { JoinResult, Member, Message, RoomInfo, ServerConfig } from './types';

/**
 * Base URL of the realtime/API server. Set NEXT_PUBLIC_SERVER_URL in production.
 * In development it defaults to the same host on port 4000, so phones on the LAN work too.
 */
export function serverUrl(): string {
  if (process.env.NEXT_PUBLIC_SERVER_URL) return process.env.NEXT_PUBLIC_SERVER_URL.replace(/\/$/, '');
  if (typeof window === 'undefined') return 'http://localhost:4000';
  return `${window.location.protocol}//${window.location.hostname}:4000`;
}

/** Local-storage URLs come back relative; S3/R2 URLs are absolute. */
export const absolutize = (url: string) => new URL(url, serverUrl() + '/').toString();

export class ApiError extends Error {
  constructor(
    public code: string,
    public status: number,
  ) {
    super(code);
  }
}

export async function api<T = unknown>(path: string, body?: unknown, token?: string): Promise<T> {
  let res: Response;
  try {
    res = await fetch(serverUrl() + path, {
      method: body === undefined ? 'GET' : 'POST',
      headers: { ...(body !== undefined ? { 'content-type': 'application/json' } : {}), ...(token ? { authorization: `Bearer ${token}` } : {}) },
      body: body === undefined ? undefined : JSON.stringify(body),
    });
  } catch {
    throw new ApiError('network', 0);
  }
  const data = (await res.json().catch(() => ({}))) as Record<string, unknown>;
  if (!res.ok) throw new ApiError(String(data.error ?? 'server_error'), res.status);
  return data as T;
}

let configPromise: Promise<ServerConfig> | null = null;
export const getConfig = () => (configPromise ??= api<ServerConfig>('/api/config').catch((e) => ((configPromise = null), Promise.reject(e))));

export const createRoom = (body: { ttl: number; emptyDelete: boolean; password?: string; device: unknown }) => api<JoinResult>('/api/rooms', body);

export const joinRoom = (body: { code: string; password?: string; ownerToken?: string; sessionToken?: string; device: unknown }) =>
  api<JoinResult>('/api/rooms/join', body);

/* ---- tokens: session per tab (sessionStorage), owner per browser (localStorage) ---- */

const safe = <T,>(fn: () => T, fallback: T): T => {
  try {
    return fn();
  } catch {
    return fallback;
  }
};

export const tokens = {
  getSession: (code: string) => safe(() => sessionStorage.getItem(`dr:s:${code}`), null),
  setSession: (code: string, t: string) => safe(() => sessionStorage.setItem(`dr:s:${code}`, t), undefined),
  clearSession: (code: string) => safe(() => sessionStorage.removeItem(`dr:s:${code}`), undefined),
  getOwner: (code: string) => safe(() => localStorage.getItem(`dr:o:${code}`), null),
  setOwner: (code: string, t: string) => safe(() => localStorage.setItem(`dr:o:${code}`, t), undefined),
  clearOwner: (code: string) => safe(() => localStorage.removeItem(`dr:o:${code}`), undefined),
};

export interface PausedRoom {
  code: string;
  expiresAt: number;
  members: number;
  messageCount: number;
  lastAt: number;
}

const PAUSED_KEY = 'dr:paused';

export const pausedRooms = {
  list(): PausedRoom[] {
    return safe(() => {
      const raw = sessionStorage.getItem(PAUSED_KEY);
      if (!raw) return [];
      const parsed = JSON.parse(raw) as PausedRoom[];
      const now = Date.now();
      const alive = parsed.filter((r) => r && r.code && r.expiresAt > now).sort((a, b) => b.lastAt - a.lastAt);
      if (alive.length !== parsed.length) sessionStorage.setItem(PAUSED_KEY, JSON.stringify(alive));
      return alive;
    }, []);
  },
  save(room: PausedRoom) {
    safe(() => {
      const current = pausedRooms.list().filter((r) => r.code !== room.code);
      sessionStorage.setItem(PAUSED_KEY, JSON.stringify([room, ...current].slice(0, 6)));
    }, undefined);
  },
  remove(code: string) {
    safe(() => {
      const next = pausedRooms.list().filter((r) => r.code !== code);
      if (next.length) sessionStorage.setItem(PAUSED_KEY, JSON.stringify(next));
      else sessionStorage.removeItem(PAUSED_KEY);
    }, undefined);
  },
};

/* ---- in-memory room snapshot cache for instant transitions when creating or resuming a room ---- */

export interface RoomSnapshot {
  room: RoomInfo;
  me: Member;
  members: Member[];
  messages: Message[];
}

const snapshots = new Map<string, RoomSnapshot>();

export const roomCache = {
  get: (code: string) => {
    const snap = snapshots.get(code);
    if (!snap) return null;
    if (snap.room.expiresAt <= Date.now()) {
      snapshots.delete(code);
      return null;
    }
    return snap;
  },
  set: (code: string, snap: RoomSnapshot) => {
    snapshots.set(code, snap);
  },
  clear: (code: string) => {
    snapshots.delete(code);
  },
};

const ERRORS: Record<string, string> = {
  network: 'เชื่อมต่อเซิร์ฟเวอร์ไม่ได้',
  not_found: 'ไม่พบห้องนี้ หรือห้องหมดอายุแล้ว',
  password_required: 'ห้องนี้ต้องใช้รหัสผ่าน',
  wrong_password: 'รหัสผ่านไม่ถูกต้อง',
  locked: 'ห้องนี้ถูกล็อก ไม่รับผู้เข้าร่วมใหม่',
  room_full: 'ห้องเต็มแล้ว (สูงสุด 50 เครื่อง)',
  rate_limited: 'ลองบ่อยเกินไป กรุณารอสักครู่',
  daily_quota: 'อัปโหลดครบโควตาของวันนี้แล้ว',
  file_too_large: 'ไฟล์ใหญ่เกินขีดจำกัด',
  room_storage_full: 'พื้นที่ของห้องเต็มแล้ว',
  too_large: 'ข้อความยาวเกินไป',
  too_many_messages: 'ห้องนี้มีข้อความครบจำนวนสูงสุดแล้ว',
  broadcast_only: 'ห้องนี้เปิดโหมดกระจายสัญญาณ เฉพาะเจ้าของห้องที่ส่งได้',
  burned: 'เนื้อหานี้ถูกทำลายแล้ว',
  forbidden: 'คุณไม่มีสิทธิ์ทำรายการนี้',
  peer_offline: 'อุปกรณ์ปลายทางออฟไลน์อยู่',
  invalid_session: 'เซสชันหมดอายุ',
};
export const errorText = (code: string) => ERRORS[code] ?? 'เกิดข้อผิดพลาด ลองใหม่อีกครั้ง';
