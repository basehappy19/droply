'use client';

import { useCallback, useEffect, useMemo, useRef, useState } from 'react';
import Link from 'next/link';
import { useRouter } from 'next/navigation';
import { Avatar, Button, Group, Icon, IconButton, Row, Sheet, Spinner, Toggle, useConfirm, useToast } from '@/components/ui';
import { getFileUrl } from '@/lib/upload';
import type { Member } from '@/lib/types';
import { copyImage, copyText, cx, formatBytes, formatRemaining, roomLink, triggerDownload, ttlLabel } from '@/lib/util';
import { Composer, type ComposerHandle } from './Composer';
import { MessageItem } from './MessageItem';
import { useRoom, type RoomApi } from './useRoom';

/* ---------------- small pieces ---------------- */

function QrImage({ text, className }: { text: string; className?: string }) {
  const [src, setSrc] = useState('');
  useEffect(() => {
    import('qrcode')
      .then((QRCode) => QRCode.toDataURL(text, { margin: 1, width: 640, errorCorrectionLevel: text.length > 400 ? 'L' : 'M' }))
      .then(setSrc, () => setSrc(''));
  }, [text]);
  return (
    <div className={cx('mx-auto aspect-square rounded-[22px] bg-white p-3 shadow-inner', className)}>
      {/* eslint-disable-next-line @next/next/no-img-element */}
      {src ? <img src={src} alt="QR Code" className="size-full [image-rendering:pixelated]" /> : <div className="grid size-full place-items-center text-[13px] text-black/50">สร้าง QR ไม่ได้</div>}
    </div>
  );
}

const warnedRooms = new Set<string>();

function Countdown({ code, expiresAt, warnSec, onWarn }: { code: string; expiresAt: number; warnSec: number; onWarn: () => void }) {
  const [now, setNow] = useState(() => Date.now());
  useEffect(() => {
    const t = setInterval(() => setNow(Date.now()), 1000);
    return () => clearInterval(t);
  }, []);
  const left = expiresAt - now;
  useEffect(() => {
    if (left <= warnSec * 1000 && left > 0 && !warnedRooms.has(code)) {
      warnedRooms.add(code);
      onWarn();
    }
  }, [code, left, warnSec, onWarn]);
  return (
    <span className={cx('inline-flex items-center gap-1 font-mono text-[12px] tabular-nums', left <= warnSec * 1000 ? 'text-ios-orange' : 'text-muted')}>
      <Icon name="clock" className="size-3.5" />
      {formatRemaining(left)}
    </span>
  );
}

function StatusCard({ icon, tone, title, text, children }: { icon: string; tone: string; title: string; text?: string; children?: React.ReactNode }) {
  return (
    <main className="grid min-h-dvh place-items-center px-5">
      <div className="glass w-full max-w-sm animate-pop rounded-[30px] p-7 text-center">
        <span className={cx('mx-auto mb-4 grid size-16 place-items-center rounded-[20px] text-white', tone)}>
          <Icon name={icon} className="size-8" strokeWidth={2.2} />
        </span>
        <h1 className="text-[21px] font-semibold">{title}</h1>
        {text && <p className="mt-1.5 text-[14.5px] text-muted">{text}</p>}
        <div className="mt-6">{children}</div>
      </div>
    </main>
  );
}

/* ---------------- main view ---------------- */

export function RoomView({ code }: { code: string }) {
  const r = useRoom(code);
  const router = useRouter();

  if (r.phase.k === 'joining' || (r.phase.k === 'ready' && !r.room)) return <RoomSkeleton code={code} />;

  if (r.phase.k === 'password') return <PasswordGate code={code} phase={r.phase} onSubmit={r.submitPassword} />;

  if (r.phase.k === 'error')
    return (
      <StatusCard icon="close" tone="bg-ios-red" title="เข้าห้องไม่ได้" text={r.phase.message}>
        <Button onClick={() => router.push('/')} className="w-full">
          กลับหน้าแรก
        </Button>
      </StatusCard>
    );

  if (r.phase.k === 'ended')
    return (
      <StatusCard
        icon={r.phase.reason === 'nuked' ? 'trash' : 'clock'}
        tone="bg-ios-orange"
        title="ห้องนี้ถูกลบแล้ว"
        text={r.phase.reason === 'nuked' ? 'มีผู้กดลบห้องทันที ข้อมูลและไฟล์ทั้งหมดถูกทำลายแล้ว' : r.phase.reason === 'empty' ? 'ไม่มีอุปกรณ์อยู่ในห้องเกินเวลาที่กำหนด' : 'ห้องหมดอายุแล้ว ข้อมูลและไฟล์ทั้งหมดถูกทำลาย'}
      >
        <Button onClick={() => router.push('/')} className="w-full">
          สร้างห้องใหม่
        </Button>
      </StatusCard>
    );

  return <ActiveRoom r={r} />;
}

/** Server-rendered shell shown while joining: same layout as the room, so the page paints instantly and doesn't jump. */
function RoomSkeleton({ code }: { code: string }) {
  return (
    <div className="mx-auto flex h-dvh max-w-3xl flex-col" aria-busy="true">
      <header className="px-3 pt-[max(0.6rem,env(safe-area-inset-top))]">
        <div className="frost flex items-center gap-2 rounded-[24px] px-2 py-2">
          <Link href="/" aria-label="หน้าแรก" className="grid size-10 place-items-center rounded-full bg-fill">
            <Icon name="back" />
          </Link>
          <div className="min-w-0 flex-1">
            <p className="whitespace-nowrap text-[17px] font-bold tracking-[0.03em] tabular-nums">{code}</p>
            <p className="text-[12px] text-muted">กำลังเชื่อมต่อ…</p>
          </div>
          <span className="h-9 w-16 rounded-full bg-fill" />
          <span className="size-10 rounded-full bg-fill" />
          <span className="size-10 rounded-full bg-fill" />
        </div>
      </header>
      <main className="flex-1 px-3 pt-4">
        <WelcomeCard code={code} loading />
      </main>
      <footer className="px-3 pb-safe">
        <div className="frost h-[104px] rounded-[26px]" />
      </footer>
    </div>
  );
}

function WelcomeCard({ code, loading, onShare }: { code: string; loading?: boolean; onShare?: () => void }) {
  return (
    <div className="glass mx-auto mt-6 max-w-sm rounded-[24px] p-6 text-center">
      <p className="text-[17px] font-semibold">{loading ? 'กำลังเข้าห้อง' : 'ห้องว่าง พร้อมรับของแล้ว'}</p>
      <p className="mt-1 text-[14px] leading-relaxed text-muted">
        เปิดเว็บนี้บนอุปกรณ์อื่น แล้วพิมพ์รหัส <b className="tracking-wider text-[var(--fg)]">{code}</b> หรือสแกน QR ของห้อง
      </p>
      <div className="mt-4 flex h-11 items-center justify-center">
        {loading ? (
          <Spinner className="text-ios-blue" />
        ) : (
          <Button tone="gray" onClick={onShare} className="py-2.5">
            <Icon name="qr" /> แสดง QR Code
          </Button>
        )}
      </div>
      <p className="mt-3 text-[12.5px] text-muted">ลากไฟล์มาวาง หรือกด Ctrl/⌘+V เพื่อวางภาพหน้าจอ</p>
    </div>
  );
}

function PasswordGate({ code, phase, onSubmit }: { code: string; phase: { error?: string; busy?: boolean }; onSubmit: (pw: string) => void }) {
  const [pw, setPw] = useState('');
  return (
    <StatusCard icon="lock" tone="bg-ios-purple" title={`ห้อง ${code}`} text="ห้องนี้ตั้งรหัสผ่านไว้">
      <form
        onSubmit={(e) => {
          e.preventDefault();
          if (pw) onSubmit(pw);
        }}
        className="space-y-3"
      >
        <input
          type="password"
          autoFocus
          value={pw}
          onChange={(e) => setPw(e.target.value)}
          placeholder="รหัสผ่าน"
          autoComplete="current-password"
          className="w-full rounded-[14px] bg-[var(--inset)] px-4 py-3 text-center text-[16px] outline-none ring-ios-purple/60 focus:ring-2"
        />
        {phase.error && <p className="text-[13px] text-ios-red">{phase.error}</p>}
        <Button type="submit" disabled={!pw || phase.busy} className="w-full">
          {phase.busy ? <Spinner /> : 'เข้าห้อง'}
        </Button>
      </form>
    </StatusCard>
  );
}

type SheetName = null | 'share' | 'members' | 'settings';

function ActiveRoom({ r }: { r: RoomApi }) {
  const toast = useToast();
  const router = useRouter();
  const room = r.room!;
  const me = r.me!;
  const [sheet, setSheet] = useState<SheetName>(null);
  const [qrText, setQrText] = useState<string | null>(null);
  const [preview, setPreview] = useState<{ url: string; type: string; name: string } | null>(null);
  const [dragging, setDragging] = useState(false);
  const [directTarget, setDirectTarget] = useState<Member | null>(null);
  const directInput = useRef<HTMLInputElement>(null);
  const composerRef = useRef<ComposerHandle | null>(null);
  const listEnd = useRef<HTMLDivElement>(null);
  const dragDepth = useRef(0);

  const canSend = !room.ownerOnlySend || me.isOwner;

  // Auto-scroll to the newest message.
  useEffect(() => {
    listEnd.current?.scrollIntoView({ behavior: 'smooth', block: 'end' });
  }, [r.messages.length, r.uploads.length]);

  /* ---- paste anywhere: files/screenshots upload immediately, text goes into the composer ---- */
  useEffect(() => {
    const onPaste = (e: ClipboardEvent) => {
      if (!canSend) return;
      const files = Array.from(e.clipboardData?.files ?? []);
      if (files.length) {
        e.preventDefault();
        const named = files.map((f) => (f.name && f.name !== 'image.png' ? f : new File([f], `screenshot-${new Date().toISOString().slice(0, 19).replace(/[:T]/g, '-')}.${f.type.split('/')[1] || 'png'}`, { type: f.type })));
        composerRef.current?.stageFiles(named);
        return;
      }
      const target = e.target as HTMLElement;
      if (target.closest('textarea, input')) return;
      const text = e.clipboardData?.getData('text');
      if (text) {
        e.preventDefault();
        composerRef.current?.insert(text);
      }
    };
    window.addEventListener('paste', onPaste);
    return () => window.removeEventListener('paste', onPaste);
  }, [canSend, r, toast]);

  /* ---- drag & drop ---- */
  const dnd = {
    onDragEnter: (e: React.DragEvent) => {
      if (!e.dataTransfer.types.includes('Files') || !canSend) return;
      dragDepth.current++;
      setDragging(true);
    },
    onDragLeave: () => {
      dragDepth.current = Math.max(0, dragDepth.current - 1);
      if (!dragDepth.current) setDragging(false);
    },
    onDragOver: (e: React.DragEvent) => e.preventDefault(),
    onDrop: (e: React.DragEvent) => {
      e.preventDefault();
      dragDepth.current = 0;
      setDragging(false);
      const files = Array.from(e.dataTransfer.files);
      if (files.length && canSend) composerRef.current?.stageFiles(files);
    },
  };

  const others = useMemo(() => r.members.filter((m) => m.id !== me.id), [r.members, me.id]);
  const incoming = r.transfers.filter((t) => t.direction === 'in' && t.state === 'waiting');
  const activeTransfers = r.transfers.filter((t) => !(t.direction === 'in' && t.state === 'waiting'));

  // Offer the cloud as a fallback when a direct transfer fails.
  const notified = useRef(new Set<string>());
  useEffect(() => {
    for (const t of r.transfers) {
      if (notified.current.has(t.xid) || !['failed', 'declined'].includes(t.state)) continue;
      notified.current.add(t.xid);
      if (t.direction === 'out' && t.state === 'failed' && t.file && r.config && t.size <= r.config.maxFileBytes) {
        const file = t.file;
        toast('ส่งตรงไม่สำเร็จ', 'error', { label: 'ส่งผ่าน Cloud', run: () => r.uploadFiles([file]) });
      } else if (t.direction === 'out') toast(t.state === 'declined' ? `${t.peerName} ปฏิเสธไฟล์ ${t.name}` : 'ส่งตรงไม่สำเร็จ', 'error');
      else toast(`รับไฟล์ ${t.name} ไม่สำเร็จ`, 'error');
      setTimeout(() => r.dismissTransfer(t.xid), 4000);
    }
  }, [r, toast]);

  const onWarn = useCallback(() => toast('ห้องจะหมดอายุใน 5 นาที — ดาวน์โหลดไฟล์ที่ต้องการไว้', 'error'), [toast]);

  // Avoid flashing "กำลังเชื่อมต่อใหม่…" during the brief initial socket handshake.
  const [showReconnecting, setShowReconnecting] = useState(false);
  useEffect(() => {
    if (r.connected) {
      setShowReconnecting(false);
      return;
    }
    const t = setTimeout(() => setShowReconnecting(true), 900);
    return () => clearTimeout(t);
  }, [r.connected]);

  // Track visualViewport so the composer stays directly above the mobile virtual keyboard (iOS Safari + Android).
  const [vvStyle, setVvStyle] = useState<{ height: number; top: number } | null>(null);
  useEffect(() => {
    const vv = window.visualViewport;
    if (!vv) return;
    const sync = () => {
      const keyboardOpen = window.innerHeight - vv.height > 100;
      if (keyboardOpen) {
        setVvStyle({ height: Math.round(vv.height), top: Math.round(vv.offsetTop) });
        requestAnimationFrame(() => listEnd.current?.scrollIntoView({ behavior: 'auto', block: 'end' }));
      } else {
        setVvStyle(null);
      }
    };
    vv.addEventListener('resize', sync);
    vv.addEventListener('scroll', sync);
    return () => {
      vv.removeEventListener('resize', sync);
      vv.removeEventListener('scroll', sync);
    };
  }, []);

  return (
    <div
      className={cx('mx-auto flex max-w-3xl flex-col', vvStyle ? 'fixed inset-x-0 z-10' : 'relative h-dvh')}
      style={vvStyle ? { top: vvStyle.top, height: vvStyle.height } : undefined}
      {...dnd}
    >
      {/* Header */}
      <header className="z-20 px-3 pt-[max(0.6rem,env(safe-area-inset-top))]">
        <div className="frost flex items-center gap-2 rounded-[24px] px-2 py-2">
          <Link href="/" aria-label="พักแชท" title="พักแชทไว้ก่อน (ยังไม่ออกจากห้อง)" className="grid size-10 place-items-center rounded-full border border-hairline bg-fill shadow-[inset_0_1px_0_rgba(255,255,255,0.12)] transition hover:brightness-115 active:scale-90">
            <Icon name="back" />
          </Link>
          <button
            onClick={async () => toast((await copyText(room.code)) ? `คัดลอกรหัส ${room.code} แล้ว` : room.code, 'success')}
            className="min-w-0 flex-1 text-left"
            title="คัดลอกรหัสห้อง"
          >
            <span className="flex items-center gap-1.5">
              <span className="whitespace-nowrap text-[17px] font-bold tracking-[0.03em] tabular-nums">{room.code}</span>
              {room.hasPassword && <Icon name="lock" className="size-3.5 text-ios-purple" />}
              {room.locked && <Icon name="lock" className="size-3.5 text-ios-red" />}
              {room.ownerOnlySend && <Icon name="broadcast" className="size-3.5 text-ios-orange" />}
            </span>
            <span className="flex items-center gap-2">
              <Countdown code={room.code} expiresAt={room.expiresAt} warnSec={r.config?.expiringWarnSec ?? 300} onWarn={onWarn} />
              {showReconnecting && <span className="animate-fade text-[11.5px] font-medium text-ios-orange">กำลังเชื่อมต่อใหม่…</span>}
            </span>
          </button>

          <button onClick={() => setSheet('members')} className="flex shrink-0 items-center gap-1 rounded-full bg-fill py-1 pl-1 pr-2.5 transition active:scale-95" aria-label={`${r.members.length} อุปกรณ์ในห้อง`}>
            <span className="flex -space-x-2">
              {r.members.slice(0, 3).map((m) => (
                <Avatar key={m.id} id={m.id} os={m.os} size="sm" ring />
              ))}
            </span>
            <span className="text-[14px] font-semibold tabular-nums">{r.members.length}</span>
          </button>
          <IconButton icon="qr" label="แชร์ห้อง" onClick={() => setSheet('share')} />
          <IconButton icon="gear" label="ตั้งค่า" onClick={() => setSheet('settings')} />
        </div>
      </header>

      {/* Messages */}
      <main className="flex-1 space-y-3 overflow-y-auto px-3 pb-4 pt-4">
        {r.messages.length === 0 && r.uploads.length === 0 && <WelcomeCard code={room.code} onShare={() => setSheet('share')} />}
        {r.messages.map((m) => (
          <MessageItem
            key={m.id}
            msg={m}
            mine={m.from === me.id}
            canDelete={m.from === me.id || me.isOwner || !!m.local}
            token={r.token}
            onReveal={r.reveal}
            onDelete={r.deleteMessage}
            onQr={setQrText}
            onPreview={setPreview}
          />
        ))}

        {/* Uploads in progress */}
        {r.uploads.map((u) => (
          <div key={u.id} className="ml-auto w-[min(88%,420px)] animate-pop rounded-[20px] bg-ios-blue p-3 text-white">
            <div className="flex items-center gap-2 text-[13.5px]">
              <Spinner className="size-4" />
              <span className="min-w-0 flex-1 truncate font-medium">{u.name}</span>
              <button onClick={u.abort} className="rounded-full bg-white/20 px-2 py-0.5 text-[12px]">
                ยกเลิก
              </button>
            </div>
            <div className="mt-2 h-1.5 overflow-hidden rounded-full bg-white/25">
              <div className="h-full rounded-full bg-white transition-[width]" style={{ width: `${(u.progress.loaded / Math.max(1, u.progress.total)) * 100}%` }} />
            </div>
            <p className="mt-1 text-[11.5px] text-white/80">
              {u.progress.state === 'preparing' ? 'กำลังเตรียมไฟล์…' : u.progress.state === 'retrying' ? 'เครือข่ายหลุด กำลังลองต่อ…' : u.progress.state === 'finishing' ? 'กำลังรวมไฟล์…' : `${formatBytes(u.progress.loaded)} / ${formatBytes(u.progress.total)}`}
            </p>
          </div>
        ))}

        {/* Direct (P2P) transfers */}
        {activeTransfers.map((t) => (
          <div key={t.xid} className={cx('glass w-[min(88%,420px)] animate-pop rounded-[20px] p-3', t.direction === 'out' && 'ml-auto')}>
            <div className="flex items-center gap-2 text-[13.5px]">
              <Icon name="bolt" className="size-4 text-ios-orange" />
              <span className="min-w-0 flex-1 truncate font-medium">
                {t.direction === 'out' ? `ส่งตรงถึง ${t.peerName}` : `รับตรงจาก ${t.peerName}`} · {t.name}
              </span>
              {['waiting', 'connecting', 'transferring'].includes(t.state) && (
                <button onClick={() => r.cancelTransfer(t.xid)} className="rounded-full bg-fill px-2 py-0.5 text-[12px]">
                  ยกเลิก
                </button>
              )}
            </div>
            <div className="mt-2 h-1.5 overflow-hidden rounded-full bg-fill">
              <div className="h-full rounded-full bg-ios-orange transition-[width]" style={{ width: `${(t.loaded / Math.max(1, t.size)) * 100}%` }} />
            </div>
            <p className="mt-1 text-[11.5px] text-muted">
              {{ waiting: 'รออีกฝั่งกดรับ…', connecting: 'กำลังเชื่อมต่อโดยตรง…', transferring: `${formatBytes(t.loaded)} / ${formatBytes(t.size)}`, done: 'เสร็จแล้ว', failed: 'ไม่สำเร็จ', declined: 'ถูกปฏิเสธ', cancelled: 'ยกเลิกแล้ว' }[t.state]}
            </p>
          </div>
        ))}
        <div ref={listEnd} />
      </main>

      {/* Composer */}
      <footer className="z-10 px-3 pb-safe">
        <Composer
          disabled={!canSend}
          disabledReason="โหมดกระจายสัญญาณ — เฉพาะเจ้าของห้องที่ส่งได้"
          onSend={r.sendText}
          onFiles={(files, burn) => r.uploadFiles(files, burn)}
          maxBytes={r.config?.maxMessageBytes ?? 65536}
          insertRef={composerRef}
        />
      </footer>

      {/* Drop overlay */}
      {dragging && (
        <div className="modal-backdrop pointer-events-none fixed inset-0 z-40 grid animate-fade place-items-center p-6">
          <div className="elevated grid w-full max-w-md animate-pop place-items-center rounded-[32px] border-2 border-dashed border-ios-blue p-10 text-center">
            <Icon name="download" className="mb-3 size-12 text-ios-blue" />
            <p className="text-[19px] font-semibold">วางไฟล์เพื่อส่งเข้าห้อง</p>
          </div>
        </div>
      )}

      {/* Incoming direct transfer requests */}
      {incoming.map((t) => (
        <div key={t.xid} className="fixed inset-x-3 top-[max(5.5rem,calc(env(safe-area-inset-top)+5rem))] z-50 mx-auto max-w-md animate-pop">
          <div className="elevated rounded-[24px] p-4">
            <div className="flex items-center gap-3">
              <span className="grid size-11 place-items-center rounded-[14px] bg-ios-orange text-white">
                <Icon name="bolt" />
              </span>
              <div className="min-w-0 flex-1">
                <p className="text-[14px] font-semibold">{t.peerName} ต้องการส่งไฟล์โดยตรง</p>
                <p className="truncate text-[13px] text-muted">
                  {t.name} · {formatBytes(t.size)}
                </p>
              </div>
            </div>
            <div className="mt-3 grid grid-cols-2 gap-2">
              <Button tone="gray" onClick={() => r.declineTransfer(t.xid)}>
                ปฏิเสธ
              </Button>
              <Button onClick={() => r.acceptTransfer(t.xid)}>รับไฟล์</Button>
            </div>
          </div>
        </div>
      ))}

      <input
        ref={directInput}
        type="file"
        multiple
        hidden
        onChange={(e) => {
          const files = Array.from(e.target.files ?? []);
          if (directTarget && files.length) r.sendDirect(directTarget, files);
          e.target.value = '';
          setDirectTarget(null);
        }}
      />

      <ShareSheet open={sheet === 'share'} onClose={() => setSheet(null)} code={room.code} isOwner={me.isOwner} ownerToken={r.ownerToken} />
      <MembersSheet
        open={sheet === 'members'}
        onClose={() => setSheet(null)}
        me={me}
        members={r.members}
        others={others}
        onRename={r.rename}
        onDirect={(m) => {
          setDirectTarget(m);
          setSheet(null);
          setTimeout(() => directInput.current?.click(), 50);
        }}
      />
      <SettingsSheet open={sheet === 'settings'} onClose={() => setSheet(null)} r={r} onLeft={() => router.push('/')} />

      <Sheet open={!!qrText} onClose={() => setQrText(null)} title="สแกนเพื่อเปิดบนมือถือ">
        {qrText && <QrImage text={qrText} className="w-full max-w-[300px]" />}
        <p className="mt-3 line-clamp-3 break-all px-2 text-center text-[12.5px] text-muted">{qrText}</p>
      </Sheet>

      {preview?.type.startsWith('image/') ? (
        <ImageLightbox p={preview} onClose={() => setPreview(null)} />
      ) : (
        <Sheet open={!!preview} onClose={() => setPreview(null)} title={preview?.name} wide>
          {preview && <Preview p={preview} />}
        </Sheet>
      )}
    </div>
  );
}

function ImageLightbox({ p, onClose }: { p: { url: string; type: string; name: string }; onClose: () => void }) {
  const toast = useToast();
  const rootRef = useRef<HTMLDivElement>(null);
  const [dy, setDy] = useState(0);
  const [dragging, setDragging] = useState(false);
  const startY = useRef<number | null>(null);
  const dyRef = useRef(0);
  dyRef.current = dy;

  // Lock body scroll & disable pull-to-refresh while lightbox is open.
  useEffect(() => {
    const prevOverflow = document.body.style.overflow;
    const prevOverscroll = document.documentElement.style.overscrollBehavior;
    document.body.style.overflow = 'hidden';
    document.documentElement.style.overscrollBehavior = 'none';
    const onKey = (e: KeyboardEvent) => e.key === 'Escape' && onClose();
    window.addEventListener('keydown', onKey);
    return () => {
      document.body.style.overflow = prevOverflow;
      document.documentElement.style.overscrollBehavior = prevOverscroll;
      window.removeEventListener('keydown', onKey);
    };
  }, [onClose]);

  // Non-passive touch listeners so preventDefault() blocks browser pull-to-refresh on swipe down.
  useEffect(() => {
    const el = rootRef.current;
    if (!el) return;
    const onTouchStart = (e: TouchEvent) => {
      if (e.touches.length !== 1) return;
      startY.current = e.touches[0].clientY;
      setDragging(true);
    };
    const onTouchMove = (e: TouchEvent) => {
      if (startY.current == null || e.touches.length !== 1) return;
      const delta = e.touches[0].clientY - startY.current;
      if (delta > 0) {
        e.preventDefault();
        setDy(delta);
      }
    };
    const onTouchEnd = () => {
      if (startY.current == null) return;
      startY.current = null;
      setDragging(false);
      if (dyRef.current > 90) onClose();
      else setDy(0);
    };
    el.addEventListener('touchstart', onTouchStart, { passive: true });
    el.addEventListener('touchmove', onTouchMove, { passive: false });
    el.addEventListener('touchend', onTouchEnd);
    el.addEventListener('touchcancel', onTouchEnd);
    return () => {
      el.removeEventListener('touchstart', onTouchStart);
      el.removeEventListener('touchmove', onTouchMove);
      el.removeEventListener('touchend', onTouchEnd);
      el.removeEventListener('touchcancel', onTouchEnd);
    };
  }, [onClose]);

  const progress = Math.min(1, dy / 260);
  const canCopy = /^image\/(png|jpeg|webp)$/.test(p.type) && typeof ClipboardItem !== 'undefined';

  async function doCopy() {
    try {
      const blob = await fetch(p.url).then((r) => r.blob());
      const ok = await copyImage(blob);
      toast(ok ? 'คัดลอกรูปแล้ว' : 'เบราว์เซอร์นี้ไม่รองรับการคัดลอกรูป', ok ? 'success' : 'error');
    } catch {
      toast('คัดลอกรูปไม่สำเร็จ', 'error');
    }
  }

  return (
    <div
      ref={rootRef}
      role="dialog"
      aria-modal
      aria-label={p.name}
      className="fixed inset-0 z-50 flex touch-none select-none flex-col overscroll-none"
    >
      <div
        className="absolute inset-0 bg-black/85 backdrop-blur-2xl transition-opacity"
        style={{ opacity: 1 - progress * 0.65 }}
        onClick={onClose}
      />

      {/* Top bar */}
      <div className="relative z-10 flex items-center justify-between gap-3 px-4 pb-2 pt-[max(0.85rem,env(safe-area-inset-top))]">
        <p className="min-w-0 flex-1 truncate text-[14.5px] font-medium text-white/90">{p.name}</p>
        <button
          type="button"
          onClick={onClose}
          aria-label="ปิด"
          className="grid size-9 shrink-0 cursor-pointer place-items-center rounded-full border border-white/15 bg-white/12 text-white backdrop-blur-md transition active:scale-90"
        >
          <Icon name="close" className="size-4" strokeWidth={2.5} />
        </button>
      </div>

      {/* Image stage */}
      <div className="relative z-10 flex flex-1 items-center justify-center overflow-hidden px-3 py-2" onClick={onClose}>
        {/* eslint-disable-next-line @next/next/no-img-element */}
        <img
          src={p.url}
          alt={p.name}
          draggable={false}
          onClick={(e) => e.stopPropagation()}
          className={cx('max-h-full max-w-full rounded-[16px] object-contain shadow-2xl', !dragging && 'transition-transform duration-200 ease-out')}
          style={{ transform: `translate3d(0, ${dy}px, 0) scale(${1 - progress * 0.14})` }}
        />
      </div>

      {/* Bottom bar */}
      <div className="relative z-10 flex flex-col items-center gap-2 px-4 pb-[max(1rem,env(safe-area-inset-bottom))] pt-2">
        <div className="flex items-center gap-2">
          <button
            type="button"
            onClick={() => triggerDownload(p.url, p.name)}
            className="inline-flex cursor-pointer items-center gap-1.5 rounded-full border border-white/15 bg-white/12 px-4 py-2 text-[13.5px] font-medium text-white backdrop-blur-md transition hover:bg-white/20 active:scale-95"
          >
            <Icon name="download" className="size-4" /> ดาวน์โหลด
          </button>
          {canCopy && (
            <button
              type="button"
              onClick={doCopy}
              className="inline-flex cursor-pointer items-center gap-1.5 rounded-full border border-white/15 bg-white/12 px-4 py-2 text-[13.5px] font-medium text-white backdrop-blur-md transition hover:bg-white/20 active:scale-95"
            >
              <Icon name="copy" className="size-4" /> คัดลอกรูป
            </button>
          )}
        </div>
        <span className="text-[11.5px] text-white/45 sm:hidden">ปัดลงเพื่อปิด</span>
      </div>
    </div>
  );
}

function Preview({ p }: { p: { url: string; type: string; name: string } }) {
  if (p.type.startsWith('image/'))
    // eslint-disable-next-line @next/next/no-img-element
    return <img src={p.url} alt={p.name} className="max-h-[70dvh] w-full rounded-[18px] object-contain" />;
  if (p.type.startsWith('video/')) return <video src={p.url} controls autoPlay playsInline className="max-h-[70dvh] w-full rounded-[18px] bg-black" />;
  if (p.type.startsWith('audio/')) return <audio src={p.url} controls autoPlay className="w-full" />;
  if (p.type === 'application/pdf')
    return (
      <div className="space-y-3">
        <iframe src={p.url} title={p.name} className="h-[65dvh] w-full rounded-[18px] bg-white" />
        <a href={p.url} target="_blank" rel="noopener noreferrer" className="block text-center text-[14px] font-medium text-ios-blue">
          เปิดในแท็บใหม่
        </a>
      </div>
    );
  return null;
}

/* ---------------- sheets ---------------- */

function ShareSheet({ open, onClose, code, isOwner, ownerToken }: { open: boolean; onClose: () => void; code: string; isOwner: boolean; ownerToken: string | null }) {
  const toast = useToast();
  const [ownerMode, setOwnerMode] = useState(false);
  const link = typeof window === 'undefined' ? '' : roomLink(code);
  const ownerLink = ownerToken ? `${link}#owner=${ownerToken}` : '';
  const shown = ownerMode && ownerLink ? ownerLink : link;

  return (
    <Sheet open={open} onClose={onClose} title="เชิญอุปกรณ์อื่นเข้าห้อง">
      <QrImage text={shown} className={cx('w-full max-w-[260px]', ownerMode && 'ring-4 ring-ios-orange')} />
      <p className="mt-4 text-center text-[34px] font-bold tracking-[0.12em] tabular-nums">{code}</p>
      <p className="mb-4 text-center text-[12.5px] text-muted">{ownerMode ? 'ลิงก์เจ้าของ: เปิดแล้วได้สิทธิ์เจ้าของห้อง — ใช้กับอุปกรณ์ของคุณเท่านั้น' : 'สแกนด้วยกล้องมือถือ หรือพิมพ์รหัสที่หน้าแรก'}</p>
      <div className="grid grid-cols-2 gap-2">
        <Button tone="gray" onClick={async () => toast((await copyText(shown)) ? 'คัดลอกลิงก์แล้ว' : 'คัดลอกไม่สำเร็จ', 'success')}>
          <Icon name="copy" /> คัดลอกลิงก์
        </Button>
        {typeof navigator !== 'undefined' && 'share' in navigator ? (
          <Button onClick={() => navigator.share({ title: `DropRoom ${code}`, url: shown }).catch(() => {})}>
            <Icon name="share" /> แชร์
          </Button>
        ) : (
          <Button onClick={() => window.open(shown, '_blank', 'noopener')}>
            <Icon name="share" /> เปิด
          </Button>
        )}
      </div>
      {isOwner && ownerToken && (
        <Group className="mt-5">
          <Row icon="lock" iconBg="bg-ios-orange" title="แสดงลิงก์เจ้าของห้อง" right={<Toggle checked={ownerMode} onChange={setOwnerMode} label="แสดงลิงก์เจ้าของห้อง" />} />
        </Group>
      )}
    </Sheet>
  );
}

function MembersSheet({
  open,
  onClose,
  me,
  members,
  others,
  onRename,
  onDirect,
}: {
  open: boolean;
  onClose: () => void;
  me: Member;
  members: Member[];
  others: Member[];
  onRename: (n: string) => Promise<boolean>;
  onDirect: (m: Member) => void;
}) {
  const [editing, setEditing] = useState(false);
  const [name, setName] = useState(me.name);
  useEffect(() => setName(me.name), [me.name]);
  return (
    <Sheet open={open} onClose={onClose} title={`อุปกรณ์ที่ออนไลน์ (${members.length})`}>
      <Group title="เครื่องนี้">
        <div className="flex items-center gap-3 px-4 py-2.5">
          <Avatar id={me.id} os={me.os} />
          {editing ? (
            <form
              className="flex flex-1 gap-2"
              onSubmit={async (e) => {
                e.preventDefault();
                if (await onRename(name)) setEditing(false);
              }}
            >
              <input autoFocus value={name} maxLength={40} onChange={(e) => setName(e.target.value)} className="min-w-0 flex-1 rounded-[10px] bg-fill px-3 py-1.5 text-[15px] outline-none" />
              <button className="rounded-full bg-ios-blue px-3 text-[13px] font-semibold text-white">บันทึก</button>
            </form>
          ) : (
            <>
              <div className="min-w-0 flex-1">
                <p className="truncate text-[15.5px]">{me.name}</p>
                <p className="text-[12.5px] text-muted">
                  {me.browser} · {me.os}
                  {me.isOwner && ' · เจ้าของห้อง'}
                </p>
              </div>
              <button onClick={() => setEditing(true)} className="grid size-8 place-items-center rounded-full bg-fill text-ios-blue" aria-label="เปลี่ยนชื่อ">
                <Icon name="pencil" className="size-4" />
              </button>
            </>
          )}
        </div>
      </Group>
      <Group title="อุปกรณ์อื่น" className="mt-5">
        {others.length === 0 && <p className="px-4 py-4 text-center text-[14px] text-muted">ยังไม่มีอุปกรณ์อื่นออนไลน์</p>}
        {others.map((m) => (
          <div key={m.id} className="flex items-center gap-3 px-4 py-2.5">
            <Avatar id={m.id} os={m.os} />
            <div className="min-w-0 flex-1">
              <p className="truncate text-[15.5px]">{m.name}</p>
              <p className="text-[12.5px] text-muted">
                {m.browser} · {m.os}
                {m.isOwner && ' · เจ้าของห้อง'}
              </p>
            </div>
            <button onClick={() => onDirect(m)} className="flex items-center gap-1 rounded-full bg-ios-orange/15 px-3 py-1.5 text-[12.5px] font-semibold text-ios-orange transition active:scale-95">
              <Icon name="bolt" className="size-4" /> ส่งตรง
            </button>
          </div>
        ))}
      </Group>
    </Sheet>
  );
}

function SettingsSheet({ open, onClose, r, onLeft }: { open: boolean; onClose: () => void; r: RoomApi; onLeft: () => void }) {
  const toast = useToast();
  const confirm = useConfirm();
  const room = r.room!;
  const me = r.me!;
  const [zipping, setZipping] = useState(false);
  const files = r.messages.filter((m) => m.kind === 'file' && m.file?.status === 'ready' && !m.burn);

  async function downloadAll() {
    setZipping(true);
    try {
      const used = new Map<string, number>();
      const entries = [];
      for (const m of files) {
        const url = m.local ? m.local.url : await getFileUrl(r.token(), m.file!.id);
        let name = m.file!.name;
        const n = used.get(name) ?? 0;
        used.set(name, n + 1);
        if (n) name = name.replace(/(\.[^.]*)?$/, ` (${n})$1`);
        entries.push({ name, input: await fetch(url), lastModified: new Date(m.at) });
      }
      const { downloadZip } = await import('client-zip');
      const blob = await downloadZip(entries).blob();
      const url = URL.createObjectURL(blob);
      triggerDownload(url, `DropRoom-${room.code}.zip`);
      setTimeout(() => URL.revokeObjectURL(url), 60_000);
    } catch {
      toast('สร้างไฟล์ ZIP ไม่สำเร็จ', 'error');
    } finally {
      setZipping(false);
    }
  }

  return (
    <Sheet open={open} onClose={onClose} title="ตั้งค่าห้อง">
      <Group title="ข้อมูลห้อง">
        <Row icon="clock" iconBg="bg-ios-blue" title="อายุห้อง" right={<span className="text-[14px] text-muted">{ttlLabel(room.ttl)}</span>} />
        <Row icon="trash" iconBg="bg-ios-teal" title="ลบเมื่อไม่มีใครอยู่" right={<span className="text-[14px] text-muted">{room.emptyDelete ? 'เปิด' : 'ปิด'}</span>} />
        <Row icon="lock" iconBg="bg-ios-purple" title="รหัสผ่าน" right={<span className="text-[14px] text-muted">{room.hasPassword ? 'มี' : 'ไม่มี'}</span>} />
        <Row
          icon="doc"
          iconBg="bg-ios-green"
          title="พื้นที่ที่ใช้"
          right={<span className="text-[14px] text-muted">{formatBytes(r.messages.reduce((n, m) => n + (m.file && !m.local && m.file.status === 'ready' ? m.file.size : 0), 0))}{r.config && ` / ${formatBytes(r.config.maxRoomBytes)}`}</span>}
        />
      </Group>

      <Group className="mt-5">
        <Row
          icon="zip"
          iconBg="bg-ios-indigo"
          title="ดาวน์โหลดไฟล์ทั้งหมด (.zip)"
          subtitle={files.length ? `${files.length} ไฟล์` : 'ยังไม่มีไฟล์'}
          onClick={files.length && !zipping ? downloadAll : undefined}
          right={zipping ? <Spinner className="size-4 text-muted" /> : <Icon name="chevron" className="size-4 text-muted" />}
        />
      </Group>

      {me.isOwner && (
        <Group title="สิทธิ์เจ้าของห้อง" className="mt-5">
          <Row icon={room.locked ? 'lock' : 'unlock'} iconBg="bg-ios-red" title="ล็อกห้อง" subtitle="ไม่รับผู้เข้าร่วมใหม่" right={<Toggle checked={room.locked} onChange={(v) => r.updateSettings({ locked: v })} label="ล็อกห้อง" />} />
          <Row icon="broadcast" iconBg="bg-ios-orange" title="โหมดกระจายสัญญาณ" subtitle="เฉพาะเจ้าของห้องที่ส่งได้" right={<Toggle checked={room.ownerOnlySend} onChange={(v) => r.updateSettings({ ownerOnlySend: v })} label="โหมดกระจายสัญญาณ" />} />
          <Row icon="trash" iconBg="bg-ios-pink" title="ให้ทุกคนลบห้องได้" right={<Toggle checked={room.allowAllNuke} onChange={(v) => r.updateSettings({ allowAllNuke: v })} label="ให้ทุกคนลบห้องได้" />} />
        </Group>
      )}

      <Group className="mt-5">
        <Row
          icon="door"
          iconBg="bg-[#8e8e93]"
          title="ออกจากห้อง"
          subtitle="ลบอุปกรณ์นี้ออกจากห้อง"
          onClick={async () => {
            await r.leave();
            onLeft();
          }}
        />
        {(me.isOwner || room.allowAllNuke) && (
          <Row
            icon="trash"
            iconBg="bg-ios-red"
            danger
            title="ทำลายห้องทันที"
            subtitle="ลบข้อความและไฟล์ทั้งหมดถาวร"
            onClick={async () => {
              const ok = await confirm({
                title: 'ทำลายห้องทันที',
                message: 'ลบข้อความและไฟล์ทั้งหมดในห้องนี้ถาวร? ย้อนกลับไม่ได้',
                confirmLabel: 'ทำลายห้อง',
                tone: 'red',
                icon: 'trash',
              });
              if (ok) void r.nuke();
            }}
          />
        )}
      </Group>
    </Sheet>
  );
}
