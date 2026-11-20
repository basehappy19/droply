const num = (v: string | undefined, d: number) => (v && !Number.isNaN(Number(v)) ? Number(v) : d);
const MB = 1024 * 1024;

export const config = {
  port: num(process.env.PORT, 4000),
  host: process.env.HOST ?? '0.0.0.0',
  /** Comma-separated web origins allowed to call the API (CORS). "*" allows any origin (development only). */
  corsOrigins: ((v) => (v.trim() === '*' ? true : v.split(',').map((s) => s.trim())))(process.env.CORS_ORIGIN ?? 'http://localhost:3000') as true | string[],
  /**
   * Public base URL of this server for local-storage upload/download links.
   * Empty (default) = relative links; the web app resolves them against its server URL.
   */
  publicUrl: (process.env.PUBLIC_URL ?? '').replace(/\/$/, ''),
  redisUrl: process.env.REDIS_URL ?? 'redis://localhost:6379',
  trustProxy: process.env.TRUST_PROXY === 'true',
  /** Run the cleanup loop inside the API process (set false when running `npm run worker` separately). */
  inlineWorker: process.env.INLINE_WORKER !== 'false',

  storage: {
    driver: (process.env.STORAGE ?? 'local') as 'local' | 's3',
    localDir: process.env.LOCAL_STORAGE_DIR ?? './data/files',
    s3: {
      endpoint: process.env.S3_ENDPOINT, // R2: https://<account>.r2.cloudflarestorage.com
      region: process.env.S3_REGION ?? 'auto',
      bucket: process.env.S3_BUCKET ?? 'droproom',
      accessKeyId: process.env.S3_ACCESS_KEY_ID ?? '',
      secretAccessKey: process.env.S3_SECRET_ACCESS_KEY ?? '',
      forcePathStyle: process.env.S3_FORCE_PATH_STYLE === 'true', // true for MinIO
    },
  },

  /** Secret used to sign local-storage URLs and hash IPs. Set a long random value in production. */
  secret: process.env.APP_SECRET ?? 'dev-secret-change-me',

  ice: {
    stun: (process.env.STUN_URLS ?? 'stun:stun.l.google.com:19302,stun:stun.cloudflare.com:3478').split(',').filter(Boolean),
    turnUrls: (process.env.TURN_URLS ?? '').split(',').filter(Boolean),
    turnUsername: process.env.TURN_USERNAME ?? '',
    turnCredential: process.env.TURN_CREDENTIAL ?? '',
  },

  limits: {
    ttlOptions: [15 * 60, 60 * 60, 24 * 60 * 60],
    defaultTtl: 60 * 60,
    emptyGraceSec: num(process.env.EMPTY_GRACE_SEC, 15 * 60),
    maxMembers: num(process.env.MAX_MEMBERS, 50),
    maxMessageBytes: 64 * 1024,
    maxMessages: 500,
    maxFileBytes: num(process.env.MAX_FILE_MB, 100) * MB,
    maxRoomBytes: num(process.env.MAX_ROOM_MB, 500) * MB,
    partSize: 8 * MB,
    downloadUrlSec: 60,
    maxBurnCount: 50,
    maxThumbBytes: 48 * 1024,
    joinFailPerMin: 10,
    joinLockoutSec: 15 * 60,
    roomsPerHour: num(process.env.ROOMS_PER_HOUR, 20),
    uploadBytesPerDay: num(process.env.UPLOAD_MB_PER_DAY, 2048) * MB,
    expiringWarnSec: 5 * 60,
  },
};

export type Config = typeof config;
