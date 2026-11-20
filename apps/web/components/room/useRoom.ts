'use client';

import { useCallback, useEffect, useRef, useState } from 'react';
import { io, type Socket } from 'socket.io-client';
import { ApiError, errorText, getConfig, joinRoom, pausedRooms, roomCache, serverUrl, tokens } from '@/lib/api';
import { P2P, type Transfer } from '@/lib/p2p';
import { uploadFile, type UploadProgress } from '@/lib/upload';
import type { Member, Message, RoomInfo, ServerConfig } from '@/lib/types';
import { parseDevice } from '@/lib/util';
import { useToast } from '@/components/ui';

export type Phase =
  | { k: 'joining' }
  | { k: 'password'; error?: string; busy?: boolean }
  | { k: 'error'; message: string }
  | { k: 'ready' }
  | { k: 'ended'; reason: string };

export interface UploadItem {
  id: string;
  name: string;
  size: number;
  progress: UploadProgress;
  abort: () => void;
}

type Ack = { ok: boolean; error?: string; [k: string]: unknown };

export function useRoom(code: string) {
  const toast = useToast();
  const cached = roomCache.get(code);
  const [phase, setPhase] = useState<Phase>(() => (cached ? { k: 'ready' } : { k: 'joining' }));
  const [room, setRoom] = useState<RoomInfo | null>(() => cached?.room ?? null);
  const [me, setMe] = useState<Member | null>(() => cached?.me ?? null);
  const [members, setMembers] = useState<Member[]>(() => cached?.members ?? []);
  const [messages, setMessages] = useState<Message[]>(() => cached?.messages ?? []);
  const [connected, setConnected] = useState(false);
  const [uploads, setUploads] = useState<UploadItem[]>([]);
  const [transfers, setTransfers] = useState<Record<string, Transfer>>({});
  const [config, setConfig] = useState<ServerConfig | null>(null);
  const [ownerToken, setOwnerToken] = useState<string | null>(null);

  const socketRef = useRef<Socket | null>(null);
  const tokenRef = useRef<string>('');
  const p2pRef = useRef<P2P | null>(null);
  const startedRef = useRef(false);
  const leavingRef = useRef(false);

  const emit = useCallback(
    (event: string, payload: unknown = {}) =>
      new Promise<Ack>((resolve) => {
        const s = socketRef.current;
        if (!s?.connected) return resolve({ ok: false, error: 'network' });
        s.timeout(10_000).emit(event, payload, (err: unknown, res: Ack) => resolve(err ? { ok: false, error: 'network' } : res));
      }),
    [],
  );

  /* ---------------- socket ---------------- */

  const connect = useCallback(
    (token: string) => {
      socketRef.current?.disconnect();
      tokenRef.current = token;
      const s = io(serverUrl(), { auth: { token }, transports: ['websocket', 'polling'], reconnectionDelayMax: 4000 });
      socketRef.current = s;

      s.on('connect', () => setConnected(true));
      s.on('disconnect', () => setConnected(false));
      s.on('connect_error', (err) => {
        if (err.message === 'invalid_session') {
          s.disconnect();
          tokens.clearSession(code);
          roomCache.clear(code);
          // Session no longer valid (room ended or device removed) — try a fresh join once.
          void start(true);
        }
      });
      s.on('room:state', (st: { room: RoomInfo; me: Member; members: Member[]; messages: Message[] }) => {
        setRoom(st.room);
        setMe(st.me);
        setMembers(st.members);
        setMessages((prev) => [...st.messages, ...prev.filter((m) => m.local)].sort((a, b) => a.at - b.at));
        setPhase({ k: 'ready' });
      });
      s.on('presence', (m: Member[]) => setMembers(m));
      s.on('me', (m: Member) => setMe(m));
      s.on('room:update', (r: RoomInfo) => setRoom(r));
      s.on('msg:new', (m: Message) => setMessages((prev) => (prev.some((x) => x.id === m.id) ? prev : [...prev, m])));
      s.on('msg:delete', ({ id }: { id: string }) => setMessages((prev) => prev.filter((m) => m.id !== id)));
      s.on('msg:update', (u: { id: string; burn?: { left: number }; fileStatus?: 'burned' }) =>
        setMessages((prev) =>
          prev.map((m) =>
            m.id !== u.id
              ? m
              : {
                  ...m,
                  burn: m.burn && u.burn ? { ...m.burn, left: u.burn.left } : m.burn,
                  file: m.file && u.fileStatus ? { ...m.file, status: u.fileStatus } : m.file,
                },
          ),
        ),
      );
      s.on('room:ended', ({ reason }: { reason: string }) => {
        tokens.clearSession(code);
        tokens.clearOwner(code);
        pausedRooms.remove(code);
        roomCache.clear(code);
        s.io.opts.reconnection = false;
        setPhase({ k: 'ended', reason });
      });
      s.on('p2p:signal', ({ from, fromName, data }: { from: string; fromName: string; data: never }) => p2pRef.current?.handle(from, fromName, data));
    },
    // eslint-disable-next-line react-hooks/exhaustive-deps
    [code],
  );

  /* ---------------- join ---------------- */

  const start = useCallback(
    async (fresh = false, password?: string) => {
      const ownerToken = tokens.getOwner(code) ?? undefined;
      setOwnerToken(ownerToken ?? null);
      try {
        const r = await joinRoom({ code, password, ownerToken, sessionToken: fresh ? undefined : (tokens.getSession(code) ?? undefined), device: parseDevice() });
        tokens.setSession(code, r.sessionToken);
        connect(r.sessionToken);
      } catch (e) {
        const c = e instanceof ApiError ? e.code : 'network';
        if (c === 'password_required') setPhase({ k: 'password' });
        else if (c === 'wrong_password') setPhase({ k: 'password', error: errorText(c) });
        else {
          if (c === 'not_found') {
            tokens.clearSession(code);
            pausedRooms.remove(code);
            roomCache.clear(code);
          }
          setPhase({ k: 'error', message: errorText(c) });
        }
      }
    },
    [code, connect],
  );

  useEffect(() => {
    if (startedRef.current) return;
    startedRef.current = true;
    // An "owner link" carries the owner token in the URL fragment (never sent to the server by the browser).
    const hash = new URLSearchParams(window.location.hash.slice(1));
    const owner = hash.get('owner');
    if (owner) {
      tokens.setOwner(code, owner);
      history.replaceState(null, '', window.location.pathname);
    }
    const existingSession = tokens.getSession(code);
    if (existingSession && roomCache.get(code)) {
      setOwnerToken(tokens.getOwner(code));
      connect(existingSession);
    } else {
      void start();
    }
    getConfig().then(setConfig, () => {});
  }, [code, start, connect]);

  useEffect(
    () => () => {
      socketRef.current?.disconnect();
      p2pRef.current?.dispose();
    },
    [],
  );

  /* ---------------- P2P ---------------- */

  useEffect(() => {
    if (p2pRef.current) {
      if (config) p2pRef.current.setIceServers(config.iceServers);
      return;
    }
    p2pRef.current = new P2P(
      (to, data) => emit('p2p:signal', { to, data }),
      config?.iceServers ?? [{ urls: 'stun:stun.l.google.com:19302' }],
      (t) => setTransfers((prev) => ({ ...prev, [t.xid]: t })),
    );
  }, [config, emit]);

  /* ---------------- actions ---------------- */

  const getToken = useCallback(() => tokenRef.current, []);

  const fail = useCallback((res: Ack) => {
    if (!res.ok) toast(errorText(res.error ?? ''), 'error');
    return res.ok;
  }, [toast]);

  const sendText = useCallback(
    async (kind: 'text' | 'code', body: string, lang?: string, burn?: number) => fail(await emit('msg:send', { kind, body, lang, burn: burn || undefined })),
    [emit, fail],
  );

  const reveal = useCallback(async (id: string) => {
    const res = await emit('msg:reveal', { id });
    if (!res.ok) {
      fail(res);
      return null;
    }
    return res.body as string;
  }, [emit, fail]);

  const messagesRef = useRef(messages);
  messagesRef.current = messages;
  const deleteMessage = useCallback(async (id: string) => {
    const local = messagesRef.current.find((m) => m.id === id && m.local);
    if (local) {
      URL.revokeObjectURL(local.local!.url);
      setMessages((prev) => prev.filter((m) => m.id !== id));
      return;
    }
    fail(await emit('msg:delete', { id }));
  }, [emit, fail]);

  const rename = useCallback(async (name: string) => fail(await emit('member:rename', { name })), [emit, fail]);
  const updateSettings = useCallback(async (patch: Partial<Pick<RoomInfo, 'locked' | 'allowAllNuke' | 'ownerOnlySend'>>) => fail(await emit('room:update', patch)), [emit, fail]);
  const nuke = useCallback(async () => fail(await emit('room:nuke')), [emit, fail]);
  // Keep this room in pausedRooms + memory cache while active so navigating back and forth is instant.
  useEffect(() => {
    if (leavingRef.current || phase.k !== 'ready' || !room || !me) return;
    roomCache.set(room.code, { room, me, members, messages });
    pausedRooms.save({
      code: room.code,
      expiresAt: room.expiresAt,
      members: members.length,
      messageCount: messages.length,
      lastAt: Date.now(),
    });
  }, [phase.k, room, me, members, messages]);

  const leave = useCallback(async () => {
    leavingRef.current = true;
    pausedRooms.remove(code);
    roomCache.clear(code);
    tokens.clearSession(code);
    await emit('room:leave');
    pausedRooms.remove(code);
    roomCache.clear(code);
    socketRef.current?.disconnect();
  }, [code, emit]);

  const uploadFiles = useCallback(
    (files: File[], burn?: number) => {
      for (const file of files) {
        if (config && file.size > config.maxFileBytes) {
          toast(`${file.name}: ${errorText('file_too_large')} — ลองส่งตรงแบบ P2P แทน`, 'error');
          continue;
        }
        const id = crypto.getRandomValues(new Uint32Array(2)).join('');
        const ctrl = new AbortController();
        const item: UploadItem = { id, name: file.name || 'ไฟล์', size: file.size, progress: { loaded: 0, total: file.size, state: 'preparing' }, abort: () => ctrl.abort() };
        setUploads((u) => [...u, item]);
        uploadFile(file, tokenRef.current, {
          burn,
          signal: ctrl.signal,
          onProgress: (p) => setUploads((u) => u.map((x) => (x.id === id ? { ...x, progress: p } : x))),
        })
          .catch((e) => {
            const c = e instanceof ApiError ? e.code : 'network';
            if (c !== 'cancelled') toast(`${file.name}: ${errorText(c)}`, 'error');
          })
          .finally(() => setUploads((u) => u.filter((x) => x.id !== id)));
      }
    },
    [config, toast],
  );

  const sendDirect = useCallback((peer: Member, files: File[]) => {
    for (const f of files) void p2pRef.current?.offer(peer.id, peer.name, f);
  }, []);
  const acceptTransfer = useCallback((xid: string) => p2pRef.current?.accept(xid), []);
  const declineTransfer = useCallback((xid: string) => p2pRef.current?.decline(xid), []);
  const cancelTransfer = useCallback((xid: string) => p2pRef.current?.cancel(xid), []);
  const dismissTransfer = useCallback((xid: string) => setTransfers((t) => {
    const { [xid]: _, ...rest } = t;
    return rest;
  }), []);

  // Completed direct transfers become local messages on both devices.
  const seenRef = useRef(new Set<string>());
  useEffect(() => {
    for (const t of Object.values(transfers)) {
      if (t.state !== 'done' || seenRef.current.has(t.xid)) continue;
      seenRef.current.add(t.xid);
      const url = t.direction === 'in' ? t.url! : URL.createObjectURL(t.file!);
      setMessages((prev) => [
        ...prev,
        {
          id: `p2p-${t.xid}`,
          kind: 'file',
          from: t.direction === 'out' ? (me?.id ?? '') : t.peerId,
          fromName: t.direction === 'out' ? (me?.name ?? '') : t.peerName,
          at: Date.now(),
          file: { id: t.xid, name: t.name, size: t.size, type: t.type, status: 'ready' },
          local: { url, direction: t.direction, peerName: t.peerName },
        },
      ]);
      dismissTransfer(t.xid);
    }
  }, [transfers, me, dismissTransfer]);

  return {
    phase,
    setPhase,
    room,
    me,
    members,
    messages,
    connected,
    uploads,
    transfers: Object.values(transfers),
    config,
    ownerToken,
    token: getToken,
    submitPassword: (pw: string) => {
      setPhase({ k: 'password', busy: true });
      return start(true, pw);
    },
    sendText,
    reveal,
    deleteMessage,
    rename,
    updateSettings,
    nuke,
    leave,
    uploadFiles,
    sendDirect,
    acceptTransfer,
    declineTransfer,
    cancelTransfer,
    dismissTransfer,
  };
}

export type RoomApi = ReturnType<typeof useRoom>;
