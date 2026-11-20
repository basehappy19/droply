export interface RoomInfo {
  id: string;
  code: string;
  createdAt: number;
  expiresAt: number;
  ttl: number;
  emptyDelete: boolean;
  emptySince: number | null;
  hasPassword: boolean;
  locked: boolean;
  allowAllNuke: boolean;
  ownerOnlySend: boolean;
  bytesUsed: number;
}

export interface Member {
  id: string;
  name: string;
  os: string;
  browser: string;
  isOwner: boolean;
  joinedAt: number;
}

export interface FileMeta {
  id: string;
  name: string;
  size: number;
  type: string;
  thumb?: string;
  status: 'ready' | 'burned';
}

export interface Message {
  id: string;
  kind: 'text' | 'code' | 'file';
  from: string;
  fromName: string;
  at: number;
  body?: string;
  lang?: string;
  file?: FileMeta;
  burn?: { max: number; left: number };
  /** Client-only: a file received directly over WebRTC (never touched the server). */
  local?: { url: string; direction: 'in' | 'out'; peerName: string };
}

export interface ServerConfig {
  ttlOptions: number[];
  defaultTtl: number;
  emptyGraceSec: number;
  maxMembers: number;
  maxMessageBytes: number;
  maxFileBytes: number;
  maxRoomBytes: number;
  maxBurnCount: number;
  expiringWarnSec: number;
  iceServers: RTCIceServer[];
}

export interface JoinResult {
  room: RoomInfo;
  me: Member;
  sessionToken: string;
  ownerToken?: string;
}
