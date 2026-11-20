'use client';

import { useEffect, useState } from 'react';
import Link from 'next/link';
import { useRouter } from 'next/navigation';
import { BrandLogo, Button, Icon, Segmented, Spinner, Toggle, useToast } from '@/components/ui';
import { createRoom, errorText, ApiError, pausedRooms, roomCache, tokens, type PausedRoom } from '@/lib/api';
import { cx, formatRemaining, parseDevice } from '@/lib/util';

const TTLS = [
  { value: 900, label: '15 นาที' },
  { value: 3600, label: '1 ชั่วโมง' },
  { value: 86400, label: '24 ชั่วโมง' },
];

export default function Home() {
  const router = useRouter();
  const toast = useToast();
  const [ttl, setTtl] = useState(3600);
  const [emptyDelete, setEmptyDelete] = useState(false);
  const [usePw, setUsePw] = useState(false);
  const [password, setPassword] = useState('');
  const [code, setCode] = useState('');
  const [busy, setBusy] = useState<'create' | 'join' | null>(null);
  const [paused, setPaused] = useState<PausedRoom[]>([]);
  const [now, setNow] = useState(() => Date.now());

  useEffect(() => {
    setPaused(pausedRooms.list());
  }, []);

  useEffect(() => {
    if (paused.length === 0) return;
    const t = setInterval(() => {
      const current = Date.now();
      setNow(current);
      setPaused((prev) => {
        const alive = prev.filter((r) => r.expiresAt > current);
        return alive.length === prev.length ? prev : pausedRooms.list();
      });
    }, 1000);
    return () => clearInterval(t);
  }, [paused.length]);

  function dismissPaused(roomCode: string) {
    pausedRooms.remove(roomCode);
    setPaused((prev) => prev.filter((r) => r.code !== roomCode));
  }

  async function onCreate() {
    if (usePw && !password.trim()) return toast('กรุณาตั้งรหัสผ่าน', 'error');
    setBusy('create');
    try {
      const r = await createRoom({ ttl, emptyDelete, password: usePw ? password : undefined, device: parseDevice() });
      tokens.setSession(r.room.code, r.sessionToken);
      if (r.ownerToken) tokens.setOwner(r.room.code, r.ownerToken);
      roomCache.set(r.room.code, { room: r.room, me: r.me, members: [r.me], messages: [] });
      router.push(`/r/${r.room.code}`);
    } catch (e) {
      toast(errorText(e instanceof ApiError ? e.code : 'network'), 'error');
      setBusy(null);
    }
  }

  function onJoin(e: React.FormEvent) {
    e.preventDefault();
    const m = code.toUpperCase().replace(/\s/g, '').match(/^([A-Z]{3,5})-?(\d{3})$/);
    if (!m) return toast('รูปแบบรหัสห้องคือ คำ-ตัวเลข 3 หลัก เช่น FOX-882', 'error');
    setBusy('join');
    router.push(`/r/${m[1]}-${m[2]}`);
  }

  return (
    <main className="mx-auto flex min-h-dvh max-w-4xl flex-col justify-center px-5 py-12 pt-[max(3rem,env(safe-area-inset-top))]">
      <header className="mb-9 text-center sm:mb-12">
        <div className="mx-auto mb-5 inline-flex rounded-[22px] shadow-[0_14px_38px_-10px_rgba(10,132,255,0.65)]">
          <BrandLogo className="size-[72px]" />
        </div>
        <h1 className="text-[38px] font-extrabold leading-tight tracking-tight sm:text-[50px]">DropRoom</h1>
        <p className="mx-auto mt-2.5 max-w-md text-[15.5px] leading-relaxed text-muted">ส่งข้อความ โค้ด ลิงก์ และไฟล์ข้ามอุปกรณ์ผ่านเว็บ ไม่ต้องล็อกอิน ข้อมูลลบตัวเองตามเวลา</p>
      </header>

      {paused.length > 0 && (
        <section aria-label="ห้องที่พักไว้" className="glass mb-5 animate-pop rounded-[26px] p-4 sm:px-5">
          <div className="mb-3 flex items-center justify-between px-1">
            <div className="flex items-center gap-2">
              <span className="relative flex size-2.5">
                <span className="absolute inline-flex size-full animate-ping rounded-full bg-ios-green opacity-75" />
                <span className="relative inline-flex size-2.5 rounded-full bg-ios-green" />
              </span>
              <h2 className="text-[14px] font-semibold tracking-tight">ห้องที่พักไว้</h2>
            </div>
            <span className="text-[12px] text-muted">แตะเพื่อกลับเข้าแชท</span>
          </div>
          <div className="grid gap-2.5 sm:grid-cols-2">
            {paused.map((r) => (
              <div key={r.code} className="glass-inset flex items-center gap-3 rounded-[18px] p-2.5 pl-4 transition hover:brightness-110">
                <Link href={`/r/${r.code}`} className="min-w-0 flex-1">
                  <p className="font-mono text-[16px] font-bold tracking-[0.06em] tabular-nums">{r.code}</p>
                  <p className="mt-0.5 flex items-center gap-2 text-[12px] text-muted">
                    <span className="inline-flex items-center gap-1 font-mono tabular-nums">
                      <Icon name="clock" className="size-3.5" />
                      {formatRemaining(r.expiresAt - now)}
                    </span>
                    <span>·</span>
                    <span>{r.messageCount} รายการ</span>
                  </p>
                </Link>
                <Link
                  href={`/r/${r.code}`}
                  className="inline-flex shrink-0 items-center gap-1 rounded-full bg-gradient-to-b from-[#0077ed] to-[#005ec4] px-3.5 py-1.5 text-[13px] font-semibold text-white shadow-[inset_0_1px_0_rgba(255,255,255,0.3)] transition hover:brightness-105 active:scale-95"
                >
                  กลับเข้าห้อง
                </Link>
                <button
                  type="button"
                  onClick={() => dismissPaused(r.code)}
                  aria-label={`ซ่อนห้อง ${r.code}`}
                  title="ซ่อนจากรายการพักไว้"
                  className="grid size-8 shrink-0 cursor-pointer place-items-center rounded-full text-muted transition hover:bg-fill hover:text-[var(--fg)] active:scale-90"
                >
                  <Icon name="close" className="size-4" strokeWidth={2.4} />
                </button>
              </div>
            ))}
          </div>
        </section>
      )}

      <div className="grid gap-5 md:grid-cols-[1.15fr_1fr]">
        {/* Create */}
        <section className="glass rounded-[32px] p-5 sm:p-6">
          <div className="mb-5 flex items-center gap-3.5">
            <span className="grid size-11 place-items-center rounded-[14px] bg-gradient-to-b from-[#339aff] to-ios-blue text-white shadow-[inset_0_1px_0_rgba(255,255,255,0.4),0_6px_18px_-6px_rgba(10,132,255,0.65)]">
              <Icon name="plus" strokeWidth={2.6} />
            </span>
            <div>
              <h2 className="text-[19px] font-semibold tracking-tight">สร้างห้องใหม่</h2>
              <p className="text-[13px] text-muted">ได้รหัสห้อง ลิงก์ และ QR Code ทันที</p>
            </div>
          </div>

          <p id="ttl-label" className="mb-2 block px-1 text-[13px] font-medium text-muted">
            อายุห้อง
          </p>
          <Segmented value={ttl} onChange={setTtl} options={TTLS} labelledBy="ttl-label" className="mb-4" />

          <div className="glass-inset divide-y divide-[var(--hairline)] rounded-[18px]">
            <div className="flex items-center gap-3 px-4 py-3.5">
              <div className="flex-1">
                <p className="text-[15px] font-medium">ลบเมื่อไม่มีใครอยู่</p>
                <p className="text-[12.5px] text-muted">ลบห้องเมื่อทุกเครื่องออกไปนาน 15 นาที</p>
              </div>
              <Toggle checked={emptyDelete} onChange={setEmptyDelete} label="ลบเมื่อไม่มีใครอยู่" />
            </div>
            <div className="px-4 py-3.5">
              <div className="flex items-center gap-3">
                <div className="flex-1">
                  <p className="text-[15px] font-medium">ตั้งรหัสผ่าน</p>
                  <p className="text-[12.5px] text-muted">ต้องกรอกรหัสผ่านก่อนเข้าห้อง</p>
                </div>
                <Toggle checked={usePw} onChange={setUsePw} label="ตั้งรหัสผ่าน" />
              </div>
              <div className={cx('grid transition-all duration-300', usePw ? 'grid-rows-[1fr] opacity-100' : 'grid-rows-[0fr] opacity-0')}>
                <div className="overflow-hidden">
                  <input
                    type="password"
                    value={password}
                    onChange={(e) => setPassword(e.target.value)}
                    placeholder="รหัสผ่านของห้อง"
                    autoComplete="new-password"
                    tabIndex={usePw ? 0 : -1}
                    className="mt-3 w-full rounded-[13px] border border-hairline bg-fill px-4 py-2.5 text-[15px] outline-none ring-ios-blue/60 transition focus:ring-2"
                  />
                </div>
              </div>
            </div>
          </div>

          <Button onClick={onCreate} disabled={!!busy} className="mt-5 w-full py-3.5 text-[16px]">
            {busy === 'create' ? <Spinner /> : <Icon name="plus" strokeWidth={2.6} />}
            สร้างห้อง
          </Button>
        </section>

        {/* Join */}
        <section className="glass flex flex-col rounded-[32px] p-5 sm:p-6">
          <div className="mb-5 flex items-center gap-3.5">
            <span className="grid size-11 place-items-center rounded-[14px] bg-gradient-to-b from-[#3fe36a] to-ios-green text-white shadow-[inset_0_1px_0_rgba(255,255,255,0.4),0_6px_18px_-6px_rgba(48,209,88,0.6)]">
              <Icon name="door" strokeWidth={2.3} />
            </span>
            <div>
              <h2 className="text-[19px] font-semibold tracking-tight">เข้าร่วมห้อง</h2>
              <p className="text-[13px] text-muted">พิมพ์รหัส หรือสแกน QR ด้วยกล้องมือถือ</p>
            </div>
          </div>
          <form onSubmit={onJoin} className="flex flex-1 flex-col">
            <input
              value={code}
              onChange={(e) => setCode(e.target.value.toUpperCase())}
              placeholder="FOX-882"
              autoCapitalize="characters"
              autoCorrect="off"
              spellCheck={false}
              inputMode="text"
              maxLength={9}
              aria-label="รหัสห้อง"
              className="glass-inset w-full rounded-[20px] px-4 py-6 text-center font-mono text-[30px] font-bold tracking-[0.16em] tabular-nums outline-none ring-ios-green/60 transition placeholder:text-muted/35 focus:ring-2"
            />
            <div className="flex-1" />
            <Button type="submit" tone="green" disabled={!!busy || code.length < 6} className="mt-5 w-full py-3.5 text-[16px]">
              {busy === 'join' ? <Spinner /> : <Icon name="door" strokeWidth={2.3} />}
              เข้าห้อง
            </Button>
          </form>
        </section>
      </div>
    </main>
  );
}
