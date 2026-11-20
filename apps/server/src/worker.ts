// Standalone cleanup worker. Run this when INLINE_WORKER=false on the API servers.
import { startCleanupLoop } from './cleanup.js';

startCleanupLoop(Number(process.env.CLEANUP_INTERVAL_MS ?? 30_000));
console.log('[worker] cleanup loop started');
