import type { Server as HttpServer } from 'node:http';
import { Server, type Socket } from 'socket.io';
import { createAdapter } from '@socket.io/redis-adapter';
import { config } from './config.js';
import { AppError } from './errors.js';
import { createRedis, ENDED_CHANNEL } from './redis.js';
import {
  addTextMessage,
  canNuke,
  deleteMessage,
  destroyRoom,
  getSession,
  leaveRoom,
  listMessages,
  markConnected,
  markDisconnected,
  onlineMembers,
  renameMember,
  revealMessage,
  updateSettings,
  type Session,
} from './rooms.js';

type Ack = (res: Record<string, unknown>) => void;

export function createIo(server: HttpServer) {
  const io = new Server(server, {
    cors: { origin: config.corsOrigins, credentials: false },
    maxHttpBufferSize: 256 * 1024,
    pingInterval: 20_000,
    pingTimeout: 20_000,
  });

  const pub = createRedis();
  const sub = createRedis();
  io.adapter(createAdapter(pub, sub));

  // Room-ended notifications come from the cleanup worker (possibly another process).
  const endedSub = createRedis();
  void endedSub.subscribe(ENDED_CHANNEL);
  endedSub.on('message', (_ch, raw) => {
    const { roomId, reason } = JSON.parse(raw) as { roomId: string; reason: string };
    io.local.to(roomId).emit('room:ended', { reason });
    // Give in-flight acks and the "ended" event time to reach clients before closing.
    setTimeout(() => io.local.in(roomId).disconnectSockets(true), 500);
  });

  const presence = async (roomId: string) => io.to(roomId).emit('presence', await onlineMembers(roomId));

  io.use(async (socket, next) => {
    const token = socket.handshake.auth?.token;
    const s = await getSession(token).catch(() => null);
    if (!s) return next(new Error('invalid_session'));
    socket.data.token = token;
    socket.data.session = s;
    next();
  });

  io.on('connection', async (socket: Socket) => {
    const first = socket.data.session as Session;
    const token = socket.data.token as string;
    const { roomId, sessionId } = first;
    void socket.join([roomId, `s:${sessionId}`]);
    await markConnected(first);

    socket.emit('room:state', {
      room: first.room,
      me: first.member,
      members: await onlineMembers(roomId),
      messages: await listMessages(roomId),
    });
    await presence(roomId);

    // Simple flood protection: 30 events per 10 s per socket.
    let budget = 30;
    const refill = setInterval(() => (budget = 30), 10_000);

    /** Wraps a handler: refreshes the session (settings may have changed) and acks errors uniformly. */
    const on = (event: string, fn: (s: Session, payload: Record<string, unknown>) => Promise<Record<string, unknown> | void>) => {
      socket.on(event, async (payload: unknown, ack?: Ack) => {
        const reply = typeof ack === 'function' ? ack : () => {};
        if (--budget < 0) return reply({ ok: false, error: 'rate_limited' });
        try {
          const s = await getSession(token);
          if (!s) {
            socket.emit('room:ended', { reason: 'expired' });
            socket.disconnect(true);
            return;
          }
          const res = await fn(s, (payload ?? {}) as Record<string, unknown>);
          reply({ ok: true, ...(res ?? {}) });
        } catch (err) {
          if (!(err instanceof AppError)) console.error(`[socket] ${event}`, err);
          reply({ ok: false, error: err instanceof AppError ? err.code : 'server_error' });
        }
      });
    };

    on('msg:send', async (s, p) => {
      const msg = await addTextMessage(s, p);
      io.to(roomId).emit('msg:new', msg);
      return { id: msg.id };
    });

    on('msg:reveal', async (s, p) => {
      const { body, left } = await revealMessage(s, p.id);
      io.to(roomId).emit('msg:update', { id: p.id, burn: { left } });
      return { body, left };
    });

    on('msg:delete', async (s, p) => {
      const msg = await deleteMessage(s, p.id);
      io.to(roomId).emit('msg:delete', { id: msg.id });
    });

    on('member:rename', async (s, p) => {
      await renameMember(s, p.name);
      socket.emit('me', s.member);
      await presence(roomId);
    });

    on('room:update', async (s, p) => {
      const room = await updateSettings(s, p);
      io.to(roomId).emit('room:update', room);
    });

    on('room:nuke', async (s) => {
      if (!canNuke(s)) throw new AppError('forbidden', 403);
      await destroyRoom(roomId, 'nuked');
    });

    on('room:leave', async (s) => {
      socket.data.left = true;
      await markDisconnected(s);
      await leaveRoom(s, token);
      await presence(roomId);
      setTimeout(() => socket.disconnect(true), 50);
    });

    // WebRTC signaling relay for direct (peer-to-peer) transfers between two online members.
    on('p2p:signal', async (s, p) => {
      if (typeof p.to !== 'string' || p.to === s.sessionId) throw new AppError('invalid_target');
      if (JSON.stringify(p.data ?? null).length > 64 * 1024) throw new AppError('too_large');
      const online = await onlineMembers(roomId);
      if (!online.some((m) => m.id === p.to)) throw new AppError('peer_offline');
      io.to(`s:${p.to}`).emit('p2p:signal', { from: s.sessionId, fromName: s.member.name, data: p.data });
    });

    socket.on('disconnect', async () => {
      clearInterval(refill);
      if (socket.data.left) return;
      const s = await getSession(token).catch(() => null);
      if (!s) return;
      await markDisconnected(s);
      await presence(roomId);
    });
  });

  return io;
}
