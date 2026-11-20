import { absolutize, api, ApiError } from './api';
import { makeThumb } from './thumb';

export interface UploadProgress {
  loaded: number;
  total: number;
  state: 'preparing' | 'uploading' | 'retrying' | 'finishing';
}

interface InitResult {
  fileId: string;
  partSize: number;
  urls: string[];
}

const CONCURRENCY = 3;
const MAX_RETRIES = 6;

const sleep = (ms: number) => new Promise((r) => setTimeout(r, ms));

/** Waits until the browser reports it is back online (or the upload is cancelled). */
function waitOnline(signal: AbortSignal) {
  if (navigator.onLine) return Promise.resolve();
  return new Promise<void>((resolve, reject) => {
    const done = () => {
      window.removeEventListener('online', done);
      signal.removeEventListener('abort', abort);
      resolve();
    };
    const abort = () => {
      window.removeEventListener('online', done);
      reject(new DOMException('aborted', 'AbortError'));
    };
    window.addEventListener('online', done);
    signal.addEventListener('abort', abort);
  });
}

function putPart(url: string, body: Blob, onProgress: (n: number) => void, signal: AbortSignal): Promise<string> {
  return new Promise((resolve, reject) => {
    const xhr = new XMLHttpRequest();
    xhr.open('PUT', absolutize(url));
    xhr.upload.onprogress = (e) => onProgress(e.loaded);
    xhr.onload = () => {
      const etag = xhr.getResponseHeader('ETag');
      if (xhr.status >= 200 && xhr.status < 300 && etag) resolve(etag);
      else reject(new Error(`part ${xhr.status}`));
    };
    xhr.onerror = () => reject(new Error('network'));
    signal.addEventListener('abort', () => xhr.abort());
    xhr.onabort = () => reject(new DOMException('aborted', 'AbortError'));
    xhr.send(body);
  });
}

/**
 * Chunked, resumable upload: the file is split into parts that upload in parallel straight to
 * storage via pre-signed URLs. A failed part is retried (waiting for the network to return), so
 * a dropped connection resumes from the parts that are missing instead of starting over.
 */
export async function uploadFile(
  file: File,
  token: string,
  opts: { burn?: number; signal: AbortSignal; onProgress: (p: UploadProgress) => void },
) {
  const { signal, onProgress } = opts;
  onProgress({ loaded: 0, total: file.size, state: 'preparing' });
  const thumb = opts.burn ? undefined : await makeThumb(file);

  const init = await api<InitResult>('/api/files/init', { name: file.name || 'file', size: file.size, type: file.type }, token);
  const loaded = new Array<number>(init.urls.length).fill(0);
  const report = (state: UploadProgress['state']) => onProgress({ loaded: loaded.reduce((a, b) => a + b, 0), total: file.size, state });

  const etags: { n: number; etag: string }[] = [];
  let nextPart = 0;
  try {
    const worker = async () => {
      while (nextPart < init.urls.length) {
        const i = nextPart++;
        const blob = file.slice(i * init.partSize, Math.min(file.size, (i + 1) * init.partSize));
        for (let attempt = 0; ; attempt++) {
          try {
            await waitOnline(signal);
            const etag = await putPart(init.urls[i], blob, (n) => ((loaded[i] = n), report('uploading')), signal);
            loaded[i] = blob.size;
            etags.push({ n: i + 1, etag });
            report('uploading');
            break;
          } catch (err) {
            if (signal.aborted || attempt >= MAX_RETRIES) throw err;
            loaded[i] = 0;
            report('retrying');
            await sleep(Math.min(15_000, 800 * 2 ** attempt));
          }
        }
      }
    };
    await Promise.all(Array.from({ length: Math.min(CONCURRENCY, init.urls.length) }, worker));
    report('finishing');
    await api('/api/files/complete', { fileId: init.fileId, parts: etags, thumb, burn: opts.burn || undefined }, token);
  } catch (err) {
    void api('/api/files/abort', { fileId: init.fileId }, token).catch(() => {});
    if (signal.aborted) throw new ApiError('cancelled', 0);
    throw err;
  }
}

export async function getFileUrl(token: string, fileId: string, inline = false) {
  const { url } = await api<{ url: string }>('/api/files/url', { fileId, inline }, token);
  return absolutize(url);
}
