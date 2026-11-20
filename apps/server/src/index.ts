import { config } from './config.js';
import { startCleanupLoop } from './cleanup.js';
import { createApp, registerRoutes } from './http.js';
import { createIo } from './socket.js';
import { isLocal, storage } from './storage.js';

if (config.secret === 'dev-secret-change-me' && process.env.NODE_ENV === 'production') {
  console.error('APP_SECRET must be set in production');
  process.exit(1);
}

const app = createApp();
const io = createIo(app.server);
registerRoutes(app, io);

if (isLocal(storage)) await storage.ensureRoot();
if (config.inlineWorker) startCleanupLoop();

await app.listen({ port: config.port, host: config.host });
app.log.info(`storage=${config.storage.driver} redis=${config.redisUrl.replace(/\/\/.*@/, '//***@')} worker=${config.inlineWorker ? 'inline' : 'external'}`);

const shutdown = async () => {
  io.close();
  await app.close();
  process.exit(0);
};
process.on('SIGINT', shutdown);
process.on('SIGTERM', shutdown);
