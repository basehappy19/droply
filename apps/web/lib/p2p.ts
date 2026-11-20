/**
 * Direct device-to-device file transfer over a WebRTC DataChannel.
 * The server only relays signaling messages; file bytes never touch it.
 */

export type TransferState = 'waiting' | 'connecting' | 'transferring' | 'done' | 'failed' | 'declined' | 'cancelled';

export interface Transfer {
  xid: string;
  direction: 'in' | 'out';
  peerId: string;
  peerName: string;
  name: string;
  size: number;
  type: string;
  loaded: number;
  state: TransferState;
  file?: File;
  url?: string;
}

type Signal =
  | { t: 'request'; xid: string; name: string; size: number; type: string }
  | { t: 'accept' | 'decline' | 'cancel' | 'done'; xid: string }
  | { t: 'sdp'; xid: string; sdp: RTCSessionDescriptionInit }
  | { t: 'ice'; xid: string; c: RTCIceCandidateInit };

interface Entry {
  t: Transfer;
  pc?: RTCPeerConnection;
  dc?: RTCDataChannel;
  chunks?: ArrayBuffer[];
  timer?: ReturnType<typeof setTimeout>;
  chain: Promise<void>;
}

const CHUNK = 64 * 1024;
const HIGH_WATER = 4 * 1024 * 1024;
const CONNECT_TIMEOUT = 25_000;
const ANSWER_TIMEOUT = 90_000;

export class P2P {
  private entries = new Map<string, Entry>();

  constructor(
    private send: (to: string, data: Signal) => Promise<{ ok: boolean; error?: string }>,
    private iceServers: RTCIceServer[],
    private onUpdate: (t: Transfer) => void,
  ) {}

  setIceServers(s: RTCIceServer[]) {
    this.iceServers = s;
  }

  private update(e: Entry, patch: Partial<Transfer>) {
    Object.assign(e.t, patch);
    this.onUpdate({ ...e.t });
  }

  private fail(e: Entry, state: TransferState = 'failed') {
    if (['done', 'failed', 'declined', 'cancelled'].includes(e.t.state)) return;
    clearTimeout(e.timer);
    e.dc?.close();
    e.pc?.close();
    e.chunks = undefined;
    this.update(e, { state });
  }

  /** Offer a file to a peer; it starts once they accept. */
  async offer(peerId: string, peerName: string, file: File) {
    const xid = crypto.getRandomValues(new Uint32Array(2)).join('');
    const e: Entry = {
      t: { xid, direction: 'out', peerId, peerName, name: file.name, size: file.size, type: file.type, loaded: 0, state: 'waiting', file },
      chain: Promise.resolve(),
    };
    this.entries.set(xid, e);
    this.onUpdate({ ...e.t });
    const res = await this.send(peerId, { t: 'request', xid, name: file.name, size: file.size, type: file.type || 'application/octet-stream' });
    if (!res.ok) return this.fail(e);
    e.timer = setTimeout(() => this.fail(e), ANSWER_TIMEOUT);
  }

  accept(xid: string) {
    const e = this.entries.get(xid);
    if (!e || e.t.state !== 'waiting') return;
    clearTimeout(e.timer);
    this.createPc(e);
    e.chunks = [];
    this.update(e, { state: 'connecting' });
    void this.send(e.t.peerId, { t: 'accept', xid });
  }

  decline(xid: string) {
    const e = this.entries.get(xid);
    if (!e) return;
    void this.send(e.t.peerId, { t: 'decline', xid });
    this.fail(e, 'declined');
  }

  cancel(xid: string) {
    const e = this.entries.get(xid);
    if (!e) return;
    void this.send(e.t.peerId, { t: 'cancel', xid });
    this.fail(e, 'cancelled');
  }

  /** Signals from one peer are processed strictly in order (SDP before ICE candidates). */
  handle(from: string, fromName: string, data: Signal) {
    let e = this.entries.get(data?.xid);
    if (data?.t === 'request' && !e) {
      e = {
        t: { xid: data.xid, direction: 'in', peerId: from, peerName: fromName, name: String(data.name).slice(0, 200), size: Number(data.size) || 0, type: String(data.type), loaded: 0, state: 'waiting' },
        chain: Promise.resolve(),
      };
      this.entries.set(data.xid, e);
      e.timer = setTimeout(() => this.fail(e!, 'cancelled'), ANSWER_TIMEOUT);
      this.onUpdate({ ...e.t });
      return;
    }
    if (!e || e.t.peerId !== from) return;
    const entry = e;
    entry.chain = entry.chain.then(() => this.process(entry, data)).catch(() => this.fail(entry));
  }

  private async process(e: Entry, s: Signal) {
    switch (s.t) {
      case 'accept': {
        if (e.t.direction !== 'out' || e.t.state !== 'waiting') return;
        clearTimeout(e.timer);
        const pc = this.createPc(e);
        const dc = pc.createDataChannel('file', { ordered: true });
        this.wireSender(e, dc);
        this.update(e, { state: 'connecting' });
        await pc.setLocalDescription(await pc.createOffer());
        await this.send(e.t.peerId, { t: 'sdp', xid: e.t.xid, sdp: pc.localDescription!.toJSON() });
        return;
      }
      case 'sdp': {
        const pc = e.pc!;
        await pc.setRemoteDescription(s.sdp);
        if (s.sdp.type === 'offer') {
          await pc.setLocalDescription(await pc.createAnswer());
          await this.send(e.t.peerId, { t: 'sdp', xid: e.t.xid, sdp: pc.localDescription!.toJSON() });
        }
        return;
      }
      case 'ice':
        if (e.pc && s.c) await e.pc.addIceCandidate(s.c).catch(() => {});
        return;
      case 'decline':
        return this.fail(e, 'declined');
      case 'cancel':
        return this.fail(e, 'cancelled');
      case 'done':
        clearTimeout(e.timer);
        this.update(e, { state: 'done', loaded: e.t.size });
        setTimeout(() => e.pc?.close(), 1000);
        return;
    }
  }

  private createPc(e: Entry) {
    const pc = new RTCPeerConnection({ iceServers: this.iceServers });
    e.pc = pc;
    pc.onicecandidate = (ev) => {
      if (ev.candidate) void this.send(e.t.peerId, { t: 'ice', xid: e.t.xid, c: ev.candidate.toJSON() });
    };
    pc.onconnectionstatechange = () => {
      if (pc.connectionState === 'failed') this.fail(e);
    };
    pc.ondatachannel = (ev) => this.wireReceiver(e, ev.channel);
    e.timer = setTimeout(() => {
      if (e.t.state === 'connecting') this.fail(e);
    }, CONNECT_TIMEOUT);
    return pc;
  }

  private wireSender(e: Entry, dc: RTCDataChannel) {
    e.dc = dc;
    dc.binaryType = 'arraybuffer';
    dc.bufferedAmountLowThreshold = 1024 * 1024;
    dc.onopen = async () => {
      clearTimeout(e.timer);
      this.update(e, { state: 'transferring' });
      const file = e.t.file!;
      try {
        for (let off = 0; off < file.size; off += CHUNK) {
          if (e.t.state !== 'transferring') return;
          if (dc.bufferedAmount > HIGH_WATER) {
            await new Promise<void>((r) => dc.addEventListener('bufferedamountlow', () => r(), { once: true }));
          }
          dc.send(await file.slice(off, off + CHUNK).arrayBuffer());
          e.t.loaded = Math.min(file.size, off + CHUNK);
          if ((off / CHUNK) % 16 === 0) this.onUpdate({ ...e.t });
        }
        dc.send('__done__');
        this.onUpdate({ ...e.t });
        // Wait for the receiver to confirm it has assembled the file.
        e.timer = setTimeout(() => this.fail(e), 60_000);
      } catch {
        this.fail(e);
      }
    };
    dc.onclose = () => {
      if (e.t.state === 'transferring' && e.t.loaded < e.t.size) this.fail(e);
    };
  }

  private wireReceiver(e: Entry, dc: RTCDataChannel) {
    e.dc = dc;
    dc.binaryType = 'arraybuffer';
    let lastReport = 0;
    dc.onopen = () => {
      clearTimeout(e.timer);
      this.update(e, { state: 'transferring' });
    };
    dc.onmessage = (ev) => {
      if (typeof ev.data === 'string') {
        if (ev.data !== '__done__' || !e.chunks) return;
        const blob = new Blob(e.chunks, { type: e.t.type });
        e.chunks = undefined;
        this.update(e, { state: 'done', loaded: blob.size, url: URL.createObjectURL(blob) });
        void this.send(e.t.peerId, { t: 'done', xid: e.t.xid });
        setTimeout(() => e.pc?.close(), 1000);
        return;
      }
      e.chunks?.push(ev.data as ArrayBuffer);
      e.t.loaded += (ev.data as ArrayBuffer).byteLength;
      const now = performance.now();
      if (now - lastReport > 150) {
        lastReport = now;
        this.onUpdate({ ...e.t });
      }
    };
    dc.onclose = () => {
      if (e.t.state === 'transferring') this.fail(e);
    };
  }

  dispose() {
    for (const e of this.entries.values()) {
      clearTimeout(e.timer);
      e.pc?.close();
    }
    this.entries.clear();
  }
}
