'use client';

import { memo, useEffect, useRef, useState } from 'react';
import { Group, Icon, Row, Sheet, Spinner, useConfirm, useToast } from '@/components/ui';
import { errorText, ApiError } from '@/lib/api';
import { langLabel } from '@/lib/languages';
import { linkify } from '@/lib/linkify';
import { getFileUrl } from '@/lib/upload';
import type { Message } from '@/lib/types';
import { copyImage, copyText, cx, formatBytes, formatTime, triggerDownload, tryFormatJson } from '@/lib/util';

interface Props {
  msg: Message;
  mine: boolean;
  canDelete: boolean;
  token: () => string;
  onReveal: (id: string) => Promise<string | null>;
  onDelete: (id: string) => void;
  onQr: (text: string) => void;
  onPreview: (p: { url: string; type: string; name: string }) => void;
}

function fileIcon(type: string) {
  if (type.startsWith('image/')) return 'image';
  if (type.startsWith('video/') || type.startsWith('audio/')) return 'play';
  if (/zip|rar|7z|tar|gzip/.test(type)) return 'zip';
  return 'doc';
}

const isPreviewable = (t: string) => /^(image\/(png|jpeg|gif|webp|avif|bmp)|video\/|audio\/|application\/pdf$)/.test(t);

function CodeBlock({ code, lang }: { code: string; lang?: string }) {
  // highlight.js is loaded on demand, the first time a code block appears.
  const [hl, setHl] = useState<{ html: string; lang: string } | null>(null);
  useEffect(() => {
    let live = true;
    import('@/lib/highlight').then((m) => live && setHl(m.highlight(code, lang)));
    return () => {
      live = false;
    };
  }, [code, lang]);
  const used = hl?.lang ?? lang ?? '';
  return (
    <div className="overflow-hidden rounded-[14px] border border-black/10 bg-[#f6f8fa] text-[#1f2328] shadow-inner dark:border-white/12 dark:bg-[#0d1117]/95 dark:text-[#e6edf3]">
      <div className="flex items-center gap-2 border-b border-black/8 bg-black/[0.03] px-3 py-1.5 text-[12px] font-medium text-[#57606a] dark:border-white/10 dark:bg-white/[0.04] dark:text-[#9ba3b0]">
        <Icon name="code" className="size-3.5" />
        {langLabel(used) || used || 'โค้ด'}
      </div>
      <pre className="max-h-[420px] overflow-auto px-3.5 py-2.5 font-mono text-[13px] leading-[1.6]">
        {hl ? <code className="hljs" dangerouslySetInnerHTML={{ __html: hl.html }} /> : <code>{code}</code>}
      </pre>
    </div>
  );
}

function MessageItemImpl({ msg, mine, canDelete, token, onReveal, onDelete, onQr, onPreview }: Props) {
  const toast = useToast();
  const confirm = useConfirm();
  const [revealed, setRevealed] = useState<string | null>(null);
  const [busy, setBusy] = useState(false);
  const [formatted, setFormatted] = useState<string | null>(null);
  const [copied, setCopied] = useState(false);
  const [menuOpen, setMenuOpen] = useState(false);
  const lpTimer = useRef<ReturnType<typeof setTimeout> | null>(null);
  const lpFired = useRef(false);
  const lpStart = useRef<{ x: number; y: number } | null>(null);

  const body = msg.body ?? revealed ?? undefined;
  const burned = msg.burn && msg.burn.left <= 0 && revealed == null;
  const fileBurned = msg.file?.status === 'burned';
  const isCleanImage =
    msg.kind === 'file' &&
    !!msg.file &&
    msg.file.type.startsWith('image/') &&
    !msg.burn &&
    !fileBurned &&
    Boolean(msg.file.thumb || msg.local?.url);
  const canCopyImg = !msg.burn && !!msg.file && /^image\/(png|jpeg|webp)$/.test(msg.file.type) && typeof ClipboardItem !== 'undefined';

  const clearLp = () => {
    if (lpTimer.current) {
      clearTimeout(lpTimer.current);
      lpTimer.current = null;
    }
  };
  useEffect(() => clearLp, []);

  const imageTouchHandlers = {
    onTouchStart: (e: React.TouchEvent) => {
      lpFired.current = false;
      const t = e.touches[0];
      lpStart.current = { x: t.clientX, y: t.clientY };
      clearLp();
      lpTimer.current = setTimeout(() => {
        lpFired.current = true;
        if ('vibrate' in navigator) navigator.vibrate?.(15);
        setMenuOpen(true);
      }, 420);
    },
    onTouchMove: (e: React.TouchEvent) => {
      if (!lpStart.current) return;
      const t = e.touches[0];
      if (Math.hypot(t.clientX - lpStart.current.x, t.clientY - lpStart.current.y) > 10) clearLp();
    },
    onTouchEnd: clearLp,
    onTouchCancel: clearLp,
    onContextMenu: (e: React.MouseEvent) => {
      e.preventDefault();
      setMenuOpen(true);
    },
  };

  async function copy(text: string) {
    if (await copyText(text)) {
      setCopied(true);
      setTimeout(() => setCopied(false), 1400);
    } else toast('คัดลอกไม่สำเร็จ', 'error');
  }

  async function withUrl(inline: boolean, fn: (url: string) => void | Promise<void>) {
    if (msg.local) return fn(msg.local.url);
    setBusy(true);
    try {
      await fn(await getFileUrl(token(), msg.file!.id, inline));
    } catch (e) {
      toast(errorText(e instanceof ApiError ? e.code : 'network'), 'error');
    } finally {
      setBusy(false);
    }
  }

  const download = async () => {
    if (msg.burn) {
      const ok = await confirm({
        title: 'ไฟล์เผาหลังดาวน์โหลด',
        message: `ไฟล์นี้จะถูกทำลายหลังดาวน์โหลดครบ ${msg.burn.max} ครั้ง (เหลือ ${msg.burn.left} ครั้ง) ต้องการดาวน์โหลดเลยไหม?`,
        confirmLabel: 'ดาวน์โหลด',
        tone: 'orange',
        icon: 'flame',
      });
      if (!ok) return;
    }
    await withUrl(false, (url) => {
      triggerDownload(url, msg.local ? msg.file!.name : undefined);
    });
  };

  const preview = () => withUrl(true, (url) => onPreview({ url, type: msg.file!.type, name: msg.file!.name }));

  const copyImg = () =>
    withUrl(true, async (url) => {
      const blob = await fetch(url).then((r) => r.blob());
      const ok = await copyImage(blob);
      toast(ok ? 'คัดลอกรูปแล้ว' : 'เบราว์เซอร์นี้ไม่รองรับการคัดลอกรูป', ok ? 'success' : 'error');
    });

  async function doReveal() {
    setBusy(true);
    const b = await onReveal(msg.id);
    setBusy(false);
    if (b != null) setRevealed(b);
  }

  const bubble = mine
    ? 'bg-gradient-to-b from-[#2b95ff] to-ios-blue text-white rounded-[22px] rounded-br-[7px] shadow-[inset_0_1px_0_rgba(255,255,255,0.3),0_6px_20px_-6px_rgba(10,132,255,0.5)]'
    : 'bg-[var(--bubble)] backdrop-blur-xl border border-[var(--glass-border)] rounded-[22px] rounded-bl-[7px] shadow-[inset_0_1px_0_var(--glass-specular),0_4px_16px_-6px_rgba(0,0,0,0.2)]';
  const linkClass = mine ? 'underline decoration-white/60 underline-offset-2 break-all' : 'text-ios-blue underline underline-offset-2 break-all';
  const actionBtn = cx('inline-flex items-center gap-1 rounded-full px-2.5 py-1 text-[12px] font-medium transition active:scale-95', mine ? 'bg-white/20 hover:bg-white/30' : 'bg-fill hover:brightness-110');
  const json = body && msg.kind !== 'file' ? tryFormatJson(body) : null;

  if (isCleanImage && msg.file) {
    const imgSrc = msg.local?.url ?? msg.file.thumb!;
    return (
      <div className={cx('flex animate-pop flex-col [contain-intrinsic-size:auto_220px] [content-visibility:auto]', mine ? 'items-end' : 'items-start')}>
        {!mine && <span className="mb-1 ml-3 text-[11.5px] font-medium text-muted">{msg.fromName}</span>}
        <button
          type="button"
          {...imageTouchHandlers}
          onClick={() => {
            if (lpFired.current) {
              lpFired.current = false;
              return;
            }
            void preview();
          }}
          disabled={busy}
          aria-label={`ดูรูป ${msg.file.name} (กดค้างเพื่อดูตัวเลือก)`}
          className={cx(
            'group relative max-w-[min(82%,360px)] cursor-pointer select-none overflow-hidden rounded-[22px] border border-[var(--glass-border)] bg-black/15 shadow-[0_10px_28px_-10px_rgba(0,0,0,0.45)] transition active:scale-[0.98] [-webkit-touch-callout:none]',
            mine ? 'rounded-br-[7px]' : 'rounded-bl-[7px]',
          )}
        >
          {/* eslint-disable-next-line @next/next/no-img-element */}
          <img src={imgSrc} alt={msg.file.name} draggable={false} className="block max-h-[420px] w-full object-contain" />
          {busy && (
            <span className="absolute inset-0 grid place-items-center bg-black/35 backdrop-blur-xs">
              <Spinner className="size-7 text-white" />
            </span>
          )}
        </button>
        <span className={cx('mt-1 text-[10.5px] text-muted', mine ? 'mr-2' : 'ml-3')}>{formatTime(msg.at)}</span>

        <Sheet open={menuOpen} onClose={() => setMenuOpen(false)} title={msg.file.name}>
          <Group>
            <Row
              icon="eye"
              iconBg="bg-ios-blue"
              title="ดูภาพเต็ม"
              onClick={() => {
                setMenuOpen(false);
                void preview();
              }}
            />
            <Row
              icon="download"
              iconBg="bg-ios-green"
              title="ดาวน์โหลด"
              subtitle={formatBytes(msg.file.size)}
              onClick={() => {
                setMenuOpen(false);
                void download();
              }}
            />
            {canCopyImg && (
              <Row
                icon="copy"
                iconBg="bg-ios-indigo"
                title="คัดลอกรูป"
                onClick={() => {
                  setMenuOpen(false);
                  void copyImg();
                }}
              />
            )}
            {canDelete && (
              <Row
                icon="trash"
                iconBg="bg-ios-red"
                danger
                title="ลบรูปนี้"
                onClick={() => {
                  setMenuOpen(false);
                  onDelete(msg.id);
                }}
              />
            )}
          </Group>
        </Sheet>
      </div>
    );
  }

  return (
    <div className={cx('flex animate-pop flex-col [contain-intrinsic-size:auto_96px] [content-visibility:auto]', mine ? 'items-end' : 'items-start')}>
      {!mine && <span className="mb-1 ml-3 text-[11.5px] font-medium text-muted">{msg.fromName}</span>}
      <div className={cx('max-w-[min(88%,640px)] px-3.5 py-2.5 shadow-sm', bubble, msg.kind === 'code' && body && 'w-[min(88%,640px)]')}>
        {/* Burn-after-reading badge */}
        {msg.burn && (
          <div className={cx('mb-1.5 flex items-center gap-1 text-[11.5px] font-semibold', mine ? 'text-white/85' : 'text-ios-orange')}>
            <Icon name="flame" className="size-3.5" />
            เผาหลังอ่าน · เหลือ {msg.burn.left}/{msg.burn.max} ครั้ง
          </div>
        )}

        {/* Hidden burn text */}
        {msg.kind !== 'file' && body == null && (
          burned ? (
            <p className="text-[14px] italic opacity-70">ข้อความนี้ถูกทำลายแล้ว</p>
          ) : (
            <button onClick={doReveal} disabled={busy} className={cx(actionBtn, 'px-3.5 py-2 text-[13.5px]')}>
              {busy ? <Spinner className="size-4" /> : <Icon name="eye" className="size-4" />} แตะเพื่อเปิดอ่าน
            </button>
          )
        )}

        {msg.kind === 'text' && body != null && !formatted && <p className="whitespace-pre-wrap break-words text-[15.5px] leading-[1.45]">{linkify(body, linkClass)}</p>}
        {(msg.kind === 'code' || formatted) && body != null && <CodeBlock code={formatted ?? body} lang={formatted ? 'json' : msg.lang} />}

        {msg.kind === 'file' && msg.file && (
          <div className="min-w-[220px]">
            {msg.file.thumb && !fileBurned && (
              <button onClick={preview} className="mb-2 block overflow-hidden rounded-[14px]" aria-label={`ดูตัวอย่าง ${msg.file.name}`}>
                {/* eslint-disable-next-line @next/next/no-img-element */}
                <img src={msg.file.thumb} alt="" className="max-h-64 w-full object-cover" />
              </button>
            )}
            {msg.local && msg.file.type.startsWith('image/') && (
              // eslint-disable-next-line @next/next/no-img-element
              <img src={msg.local.url} alt="" className="mb-2 max-h-64 w-full rounded-[14px] object-cover" />
            )}
            <div className="flex items-center gap-3">
              <span className={cx('grid size-11 shrink-0 place-items-center rounded-[12px]', mine ? 'bg-white/20' : 'bg-fill')}>
                <Icon name={fileIcon(msg.file.type)} />
              </span>
              <div className="min-w-0 flex-1">
                <p className={cx('truncate text-[14.5px] font-medium', fileBurned && 'line-through opacity-60')}>{msg.file.name}</p>
                <p className={cx('text-[12px]', mine ? 'text-white/75' : 'text-muted')}>
                  {formatBytes(msg.file.size)}
                  {msg.local && ` · ส่งตรง (P2P) ${msg.local.direction === 'in' ? 'จาก' : 'ถึง'} ${msg.local.peerName}`}
                  {fileBurned && ' · ถูกทำลายแล้ว'}
                </p>
              </div>
            </div>
          </div>
        )}

        {/* actions */}
        <div className="mt-2 flex flex-wrap items-center gap-1.5">
          {msg.kind !== 'file' && body != null && (
            <>
              <button className={actionBtn} onClick={() => copy(formatted ?? body)}>
                <Icon name={copied ? 'check' : 'copy'} className="size-3.5" /> {copied ? 'คัดลอกแล้ว' : msg.kind === 'code' ? 'Copy Code' : 'คัดลอก'}
              </button>
              {body.length <= 1500 && (
                <button className={actionBtn} onClick={() => onQr(body)}>
                  <Icon name="qr" className="size-3.5" /> QR
                </button>
              )}
              {json && (
                <button className={actionBtn} onClick={() => setFormatted(formatted ? null : json)}>
                  <Icon name="wand" className="size-3.5" /> {formatted ? 'ต้นฉบับ' : 'จัดรูปแบบ JSON'}
                </button>
              )}
            </>
          )}
          {msg.kind === 'file' && msg.file && !fileBurned && (
            <>
              <button className={actionBtn} onClick={download} disabled={busy}>
                {busy ? <Spinner className="size-3.5" /> : <Icon name="download" className="size-3.5" />} ดาวน์โหลด
              </button>
              {!msg.burn && isPreviewable(msg.file.type) && (
                <button className={actionBtn} onClick={preview} disabled={busy}>
                  <Icon name={msg.file.type.startsWith('video/') || msg.file.type.startsWith('audio/') ? 'play' : 'eye'} className="size-3.5" /> ดู
                </button>
              )}
              {!msg.burn && /^image\/(png|jpeg|webp)$/.test(msg.file.type) && typeof ClipboardItem !== 'undefined' && (
                <button className={actionBtn} onClick={copyImg} disabled={busy}>
                  <Icon name="copy" className="size-3.5" /> คัดลอกรูป
                </button>
              )}
            </>
          )}
          {canDelete && (
            <button className={cx(actionBtn, 'ml-auto')} onClick={() => onDelete(msg.id)} aria-label="ลบข้อความ">
              <Icon name="trash" className="size-3.5" />
            </button>
          )}
        </div>
      </div>
      <span className={cx('mt-1 text-[10.5px] text-muted', mine ? 'mr-2' : 'ml-3')}>{formatTime(msg.at)}</span>
    </div>
  );
}

export const MessageItem = memo(MessageItemImpl);
