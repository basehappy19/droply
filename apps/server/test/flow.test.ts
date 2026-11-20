// Integration test against a running server (npm run dev) + Redis.
// Run: SERVER_URL=http://localhost:4000 npm test
import { test } from 'node:test';
import assert from 'node:assert/strict';
import { io, type Socket } from 'socket.io-client';

const BASE = process.env.SERVER_URL ?? 'http://localhost:4000';

async function api(path: string, body: unknown, token?: string) {
  const res = await fetch(BASE + path, {
    method: 'POST',
    headers: { 'content-type': 'application/json', ...(token ? { authorization: `Bearer ${token}` } : {}) },
    body: JSON.stringify(body),
  });
  return { status: res.status, data: (await res.json()) as any };
}

function connect(token: string): Promise<{ socket: Socket; state: any }> {
  return new Promise((resolve, reject) => {
    const socket = io(BASE, { auth: { token }, transports: ['websocket'] });
    socket.once('room:state', (state) => resolve({ socket, state }));
    socket.once('connect_error', reject);
  });
}

const emit = (s: Socket, ev: string, p: unknown) => new Promise<any>((r) => s.emit(ev, p, r));
const next = (s: Socket, ev: string) => new Promise<any>((r) => s.once(ev, r));

test('room lifecycle: messages, files, burn, nuke', async () => {
  const created = await api('/api/rooms', { ttl: 900, device: { os: 'Windows', browser: 'Chrome' } });
  assert.equal(created.status, 200);
  const { room, sessionToken: ownerSession } = created.data;
  assert.match(room.code, /^[A-Z]{3,5}-\d{3}$/);

  const joined = await api('/api/rooms/join', { code: room.code.toLowerCase().replace('-', ''), device: { os: 'iOS', browser: 'Safari' } });
  assert.equal(joined.status, 200);

  const a = await connect(ownerSession);
  const b = await connect(joined.data.sessionToken);
  assert.equal(b.state.room.id, room.id);

  // text message round-trip
  const got = next(b.socket, 'msg:new');
  const sent = await emit(a.socket, 'msg:send', { kind: 'text', body: 'hello https://example.com' });
  assert.equal(sent.ok, true);
  assert.equal((await got).body, 'hello https://example.com');

  // burn-after-reading text: 1 open
  const burnNew = next(b.socket, 'msg:new');
  await emit(a.socket, 'msg:send', { kind: 'text', body: 'secret', burn: 1 });
  const bm = await burnNew;
  assert.equal(bm.body, undefined);
  assert.equal((await emit(b.socket, 'msg:reveal', { id: bm.id })).body, 'secret');
  assert.equal((await emit(b.socket, 'msg:reveal', { id: bm.id })).error, 'burned');

  // file upload in 2 parts (part size is 8 MB, so use 9 MB)
  const size = 9 * 1024 * 1024;
  const init = await api('/api/files/init', { name: 'ทดสอบ.bin', size, type: 'application/octet-stream' }, ownerSession);
  assert.equal(init.status, 200, JSON.stringify(init.data));
  assert.equal(init.data.urls.length, 2);
  const buf = Buffer.alloc(size, 7);
  const parts = [];
  for (let i = 0; i < init.data.urls.length; i++) {
    const chunk = buf.subarray(i * init.data.partSize, (i + 1) * init.data.partSize);
    const r = await fetch(new URL(init.data.urls[i], BASE), { method: 'PUT', body: chunk });
    assert.equal(r.status, 200);
    parts.push({ n: i + 1, etag: r.headers.get('etag') });
  }
  const fileNew = next(b.socket, 'msg:new');
  const done = await api('/api/files/complete', { fileId: init.data.fileId, parts, burn: 1 }, ownerSession);
  assert.equal(done.status, 200, JSON.stringify(done.data));
  const fm = await fileNew;
  assert.equal(fm.file.size, size);

  const urlRes = await api('/api/files/url', { fileId: init.data.fileId }, joined.data.sessionToken);
  assert.equal(urlRes.status, 200);
  const dl = await fetch(new URL(urlRes.data.url, BASE));
  assert.equal(dl.status, 200);
  assert.equal((await dl.arrayBuffer()).byteLength, size);
  assert.match(dl.headers.get('content-disposition') ?? '', /attachment/);
  const again = await api('/api/files/url', { fileId: init.data.fileId }, joined.data.sessionToken);
  assert.equal(again.status, 410);

  // only the owner can nuke by default
  assert.equal((await emit(b.socket, 'room:nuke', {})).error, 'forbidden');
  const ended = next(b.socket, 'room:ended');
  await emit(a.socket, 'room:nuke', {});
  assert.equal((await ended).reason, 'nuked');
  const rejoin = await api('/api/rooms/join', { code: room.code });
  assert.equal(rejoin.status, 404);
  a.socket.close();
  b.socket.close();
});

test('locked room and wrong-code rate limiting', async () => {
  const { data } = await api('/api/rooms', { ttl: 900 });
  const a = await connect(data.sessionToken);
  await emit(a.socket, 'room:update', { locked: true });
  assert.equal((await api('/api/rooms/join', { code: data.room.code })).status, 423);
  // the owner link still works on a locked room
  assert.equal((await api('/api/rooms/join', { code: data.room.code, ownerToken: data.ownerToken })).status, 200);
  await emit(a.socket, 'room:nuke', {});
  a.socket.close();
});
