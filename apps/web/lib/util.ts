export function parseDevice(ua = typeof navigator !== 'undefined' ? navigator.userAgent : '') {
  const touchMac = typeof navigator !== 'undefined' && /Macintosh/.test(ua) && navigator.maxTouchPoints > 1;
  const os = /iPhone|iPod/.test(ua)
    ? 'iOS'
    : /iPad/.test(ua) || touchMac
      ? 'iPadOS'
      : /Android/.test(ua)
        ? 'Android'
        : /CrOS/.test(ua)
          ? 'ChromeOS'
          : /Windows/.test(ua)
            ? 'Windows'
            : /Mac OS X|Macintosh/.test(ua)
              ? 'macOS'
              : /Linux/.test(ua)
                ? 'Linux'
                : 'อุปกรณ์';
  const browser = /Edg\//.test(ua)
    ? 'Edge'
    : /SamsungBrowser/.test(ua)
      ? 'Samsung'
      : /OPR\//.test(ua)
        ? 'Opera'
        : /Firefox|FxiOS/.test(ua)
          ? 'Firefox'
          : /Chrome|CriOS/.test(ua)
            ? 'Chrome'
            : /Safari/.test(ua)
              ? 'Safari'
              : 'เบราว์เซอร์';
  return { os, browser };
}

export const deviceKind = (os: string) => (os === 'iOS' || os === 'Android' ? 'phone' : os === 'iPadOS' ? 'tablet' : 'laptop');

export function formatBytes(n: number) {
  if (n < 1024) return `${n} B`;
  const u = ['KB', 'MB', 'GB'];
  let i = -1;
  do {
    n /= 1024;
    i++;
  } while (n >= 1024 && i < u.length - 1);
  return `${n.toFixed(n < 10 ? 1 : 0)} ${u[i]}`;
}

export function formatRemaining(ms: number) {
  const s = Math.max(0, Math.floor(ms / 1000));
  const h = Math.floor(s / 3600);
  const m = Math.floor((s % 3600) / 60);
  const sec = s % 60;
  return h ? `${h}:${String(m).padStart(2, '0')}:${String(sec).padStart(2, '0')}` : `${m}:${String(sec).padStart(2, '0')}`;
}

export const formatTime = (t: number) => new Date(t).toLocaleTimeString('th-TH', { hour: '2-digit', minute: '2-digit' });

export const ttlLabel = (sec: number) => (sec < 3600 ? `${sec / 60} นาที` : `${sec / 3600} ชั่วโมง`);

/** Copy that also works on plain-http LAN pages, where navigator.clipboard is unavailable. */
export async function copyText(text: string): Promise<boolean> {
  try {
    if (navigator.clipboard && window.isSecureContext) {
      await navigator.clipboard.writeText(text);
      return true;
    }
  } catch {
    /* fall through */
  }
  const ta = document.createElement('textarea');
  ta.value = text;
  ta.setAttribute('readonly', '');
  ta.style.cssText = 'position:fixed;top:-1000px;opacity:0';
  document.body.appendChild(ta);
  ta.select();
  ta.setSelectionRange(0, text.length);
  let ok = false;
  try {
    ok = document.execCommand('copy');
  } catch {
    ok = false;
  }
  ta.remove();
  return ok;
}

export async function copyImage(blob: Blob): Promise<boolean> {
  try {
    const png = blob.type === 'image/png' ? blob : await toPng(blob);
    await navigator.clipboard.write([new ClipboardItem({ 'image/png': png })]);
    return true;
  } catch {
    return false;
  }
}

async function toPng(blob: Blob): Promise<Blob> {
  const bmp = await createImageBitmap(blob);
  const c = document.createElement('canvas');
  c.width = bmp.width;
  c.height = bmp.height;
  c.getContext('2d')!.drawImage(bmp, 0, 0);
  return new Promise((r, j) => c.toBlob((b) => (b ? r(b) : j(new Error('png'))), 'image/png'));
}

/** Triggers a download for a URL (server sends Content-Disposition: attachment) or a blob: URL. */
export function triggerDownload(url: string, filename?: string) {
  const a = document.createElement('a');
  a.href = url;
  if (filename) a.download = filename;
  a.rel = 'noopener';
  document.body.appendChild(a);
  a.click();
  a.remove();
}

export const roomLink = (code: string) => `${window.location.origin}/r/${code}`;

export const cx = (...c: (string | false | null | undefined)[]) => c.filter(Boolean).join(' ');

export function tryFormatJson(s: string): string | null {
  const t = s.trim();
  if (!/^[[{]/.test(t)) return null;
  try {
    return JSON.stringify(JSON.parse(t), null, 2);
  } catch {
    return null;
  }
}
