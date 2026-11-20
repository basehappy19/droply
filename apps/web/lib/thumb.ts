/** Builds a small WebP/JPEG data-URL thumbnail on the sender's device (images and the first page of PDFs). */

const MAX = 360;
const LIMIT = 46 * 1024;

function canvasToDataUrl(canvas: HTMLCanvasElement): string | undefined {
  for (const [type, q] of [
    ['image/webp', 0.72],
    ['image/webp', 0.5],
    ['image/jpeg', 0.6],
    ['image/jpeg', 0.4],
  ] as const) {
    const url = canvas.toDataURL(type, q);
    if (url.startsWith(`data:${type}`) && url.length * 0.75 <= LIMIT) return url;
  }
  return undefined;
}

function draw(source: CanvasImageSource, w: number, h: number) {
  const scale = Math.min(1, MAX / Math.max(w, h));
  const c = document.createElement('canvas');
  c.width = Math.max(1, Math.round(w * scale));
  c.height = Math.max(1, Math.round(h * scale));
  const ctx = c.getContext('2d')!;
  ctx.fillStyle = '#fff';
  ctx.fillRect(0, 0, c.width, c.height);
  ctx.drawImage(source, 0, 0, c.width, c.height);
  return canvasToDataUrl(c);
}

async function imageThumb(file: Blob) {
  const bmp = await createImageBitmap(file);
  try {
    return draw(bmp, bmp.width, bmp.height);
  } finally {
    bmp.close();
  }
}

async function pdfThumb(file: Blob) {
  const pdfjs = await import('pdfjs-dist');
  pdfjs.GlobalWorkerOptions.workerSrc = '/pdf.worker.min.mjs';
  const task = pdfjs.getDocument({ data: new Uint8Array(await file.arrayBuffer()) });
  const doc = await task.promise;
  try {
    const page = await doc.getPage(1);
    const vp = page.getViewport({ scale: 1 });
    const viewport = page.getViewport({ scale: Math.min(2, (MAX * 1.5) / Math.max(vp.width, vp.height)) });
    const c = document.createElement('canvas');
    c.width = Math.ceil(viewport.width);
    c.height = Math.ceil(viewport.height);
    await page.render({ canvas: c, viewport }).promise;
    return draw(c, c.width, c.height);
  } finally {
    void task.destroy();
  }
}

async function videoThumb(file: Blob) {
  const url = URL.createObjectURL(file);
  try {
    const v = document.createElement('video');
    v.muted = true;
    v.playsInline = true;
    v.preload = 'metadata';
    v.src = url;
    await new Promise<void>((res, rej) => {
      v.onloadeddata = () => res();
      v.onerror = () => rej(new Error('video'));
      setTimeout(() => rej(new Error('timeout')), 4000);
    });
    v.currentTime = Math.min(1, (v.duration || 2) / 3);
    await new Promise<void>((res) => {
      v.onseeked = () => res();
      setTimeout(res, 1500);
    });
    return draw(v, v.videoWidth, v.videoHeight);
  } finally {
    URL.revokeObjectURL(url);
  }
}

export async function makeThumb(file: File): Promise<string | undefined> {
  try {
    if (/^image\/(png|jpeg|gif|webp|avif|bmp)$/.test(file.type) && file.size < 40 * 1024 * 1024) return await imageThumb(file);
    if (file.type === 'application/pdf' && file.size < 60 * 1024 * 1024) return await pdfThumb(file);
    if (file.type.startsWith('video/')) return await videoThumb(file);
  } catch {
    /* thumbnails are best-effort */
  }
  return undefined;
}
