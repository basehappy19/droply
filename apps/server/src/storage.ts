import { createReadStream, createWriteStream } from 'node:fs';
import { mkdir, readdir, rm, stat } from 'node:fs/promises';
import path from 'node:path';
import { pipeline } from 'node:stream/promises';
import type { Readable } from 'node:stream';
import {
  AbortMultipartUploadCommand,
  CompleteMultipartUploadCommand,
  CreateMultipartUploadCommand,
  DeleteObjectsCommand,
  GetObjectCommand,
  ListMultipartUploadsCommand,
  ListObjectsV2Command,
  S3Client,
  UploadPartCommand,
} from '@aws-sdk/client-s3';
import { getSignedUrl } from '@aws-sdk/s3-request-presigner';
import { config } from './config.js';
import { contentDisposition, randomId, signToken } from './util.js';

export interface UrlOptions {
  filename: string;
  contentType: string;
  inline: boolean;
  expiresSec: number;
}

export interface Storage {
  /** Starts a multipart upload and returns one pre-signed PUT URL per part. */
  initUpload(key: string, contentType: string, partCount: number): Promise<{ uploadId: string; urls: string[] }>;
  complete(key: string, uploadId: string, parts: { n: number; etag: string }[]): Promise<void>;
  abort(key: string, uploadId: string): Promise<void>;
  getUrl(key: string, opts: UrlOptions): Promise<string>;
  /** Deletes every object (and unfinished upload) under the prefix. */
  deletePrefix(prefix: string): Promise<void>;
}

/* ---------------- S3 / Cloudflare R2 ---------------- */

class S3Storage implements Storage {
  private s3: S3Client;
  private bucket = config.storage.s3.bucket;

  constructor() {
    const c = config.storage.s3;
    this.s3 = new S3Client({
      region: c.region,
      endpoint: c.endpoint,
      forcePathStyle: c.forcePathStyle,
      credentials: { accessKeyId: c.accessKeyId, secretAccessKey: c.secretAccessKey },
      // Pre-signed part URLs are filled by the browser, so the SDK must not bake a checksum of an
      // empty body into them (R2 and S3 would reject the real upload).
      requestChecksumCalculation: 'WHEN_REQUIRED',
      responseChecksumValidation: 'WHEN_REQUIRED',
    });
  }

  async initUpload(key: string, contentType: string, partCount: number) {
    const res = await this.s3.send(new CreateMultipartUploadCommand({ Bucket: this.bucket, Key: key, ContentType: contentType }));
    const uploadId = res.UploadId!;
    const urls = await Promise.all(
      Array.from({ length: partCount }, (_, i) =>
        getSignedUrl(this.s3, new UploadPartCommand({ Bucket: this.bucket, Key: key, UploadId: uploadId, PartNumber: i + 1 }), {
          expiresIn: 60 * 60,
        }),
      ),
    );
    return { uploadId, urls };
  }

  async complete(key: string, uploadId: string, parts: { n: number; etag: string }[]) {
    await this.s3.send(
      new CompleteMultipartUploadCommand({
        Bucket: this.bucket,
        Key: key,
        UploadId: uploadId,
        MultipartUpload: { Parts: parts.map((p) => ({ PartNumber: p.n, ETag: p.etag })) },
      }),
    );
  }

  async abort(key: string, uploadId: string) {
    await this.s3.send(new AbortMultipartUploadCommand({ Bucket: this.bucket, Key: key, UploadId: uploadId })).catch(() => {});
  }

  getUrl(key: string, o: UrlOptions) {
    return getSignedUrl(
      this.s3,
      new GetObjectCommand({
        Bucket: this.bucket,
        Key: key,
        ResponseContentType: o.contentType,
        ResponseContentDisposition: contentDisposition(o.filename, o.inline),
      }),
      { expiresIn: o.expiresSec },
    );
  }

  async deletePrefix(prefix: string) {
    let token: string | undefined;
    do {
      const list = await this.s3.send(new ListObjectsV2Command({ Bucket: this.bucket, Prefix: prefix, ContinuationToken: token }));
      const keys = (list.Contents ?? []).map((o) => ({ Key: o.Key! }));
      if (keys.length) await this.s3.send(new DeleteObjectsCommand({ Bucket: this.bucket, Delete: { Objects: keys, Quiet: true } }));
      token = list.IsTruncated ? list.NextContinuationToken : undefined;
    } while (token);
    const uploads = await this.s3.send(new ListMultipartUploadsCommand({ Bucket: this.bucket, Prefix: prefix })).catch(() => null);
    for (const u of uploads?.Uploads ?? []) await this.abort(u.Key!, u.UploadId!);
  }
}

/* ---------------- Local disk (development / single server) ---------------- */

export class LocalStorage implements Storage {
  readonly root = path.resolve(config.storage.localDir);

  /** Resolve a storage key to a path, refusing anything that escapes the root. */
  file(key: string) {
    const p = path.resolve(this.root, key);
    if (!p.startsWith(this.root + path.sep)) throw new Error('bad key');
    return p;
  }

  async initUpload(key: string, _contentType: string, partCount: number) {
    const uploadId = randomId(12);
    await mkdir(this.file(`${key}.parts`), { recursive: true });
    const exp = Date.now() + 60 * 60 * 1000;
    const urls = Array.from({ length: partCount }, (_, i) => `${config.publicUrl}/blob/part?t=${signToken({ k: key, u: uploadId, n: i + 1, exp })}`);
    return { uploadId, urls };
  }

  async writePart(key: string, n: number, body: Readable): Promise<string> {
    const p = path.join(this.file(`${key}.parts`), String(n));
    await pipeline(body, createWriteStream(p));
    const s = await stat(p);
    return `"${n}-${s.size}"`;
  }

  async complete(key: string, _uploadId: string, parts: { n: number; etag: string }[]) {
    const dir = this.file(`${key}.parts`);
    const out = createWriteStream(this.file(key));
    for (const { n } of [...parts].sort((a, b) => a.n - b.n)) {
      await pipeline(createReadStream(path.join(dir, String(n))), out, { end: false });
    }
    await new Promise<void>((resolve, reject) => out.end((err?: Error | null) => (err ? reject(err) : resolve())));
    await rm(dir, { recursive: true, force: true });
  }

  async abort(key: string) {
    await rm(this.file(`${key}.parts`), { recursive: true, force: true });
  }

  async getUrl(key: string, o: UrlOptions) {
    const t = signToken({ k: key, fn: o.filename, ct: o.contentType, il: o.inline, exp: Date.now() + o.expiresSec * 1000 });
    return `${config.publicUrl}/blob/get?t=${t}`;
  }

  async deletePrefix(prefix: string) {
    const dir = this.file(prefix.replace(/\/$/, ''));
    await rm(dir, { recursive: true, force: true });
    await rm(`${dir}.parts`, { recursive: true, force: true });
  }

  async sizeOf(key: string) {
    return (await stat(this.file(key))).size;
  }

  async ensureRoot() {
    await mkdir(this.root, { recursive: true });
    return readdir(this.root);
  }
}

export const storage: Storage = config.storage.driver === 's3' ? new S3Storage() : new LocalStorage();
export const isLocal = (s: Storage): s is LocalStorage => s instanceof LocalStorage;
