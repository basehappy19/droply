// End-to-end test: two browsers (desktop + iPhone-sized, dark mode) exercise every main feature.
// Needs the app running (npm run dev or build+start) and Google Chrome / Chromium installed.
//   cd e2e && npm install && WEB=http://localhost:3000 CHROME_PATH=/usr/bin/google-chrome npm test
import puppeteer from 'puppeteer-core';
import { writeFileSync, mkdirSync } from 'node:fs';
import { tmpdir } from 'node:os';
import { join } from 'node:path';
import { deflateSync, crc32 } from 'node:zlib';

const WEB = process.env.WEB ?? 'http://localhost:3000';
const OUT = new URL('./shots/', import.meta.url).pathname;
mkdirSync(OUT, { recursive: true });

// ---- test fixtures: a gradient PNG, a one-page PDF and a text file ----
const TMP = tmpdir();
const PHOTO = join(TMP, 'photo.png');
const PDF = join(TMP, 'handout.pdf');
const NOTES = join(TMP, 'notes.txt');
{
  const w = 480, h = 320;
  const raw = Buffer.alloc((w * 3 + 1) * h);
  for (let y = 0; y < h; y++)
    for (let x = 0; x < w; x++) {
      const o = y * (w * 3 + 1) + 1 + x * 3;
      raw[o] = 10 + (245 * x) / w; raw[o + 1] = 132 - (42 * y) / h; raw[o + 2] = 255 - (200 * x) / w;
    }
  const chunk = (t, d) => { const len = Buffer.alloc(4); len.writeUInt32BE(d.length); const td = Buffer.concat([Buffer.from(t), d]); const c = Buffer.alloc(4); c.writeUInt32BE(crc32(td) >>> 0); return Buffer.concat([len, td, c]); };
  const ihdr = Buffer.alloc(13); ihdr.writeUInt32BE(w, 0); ihdr.writeUInt32BE(h, 4); ihdr.set([8, 2, 0, 0, 0], 8);
  writeFileSync(PHOTO, Buffer.concat([Buffer.from([137, 80, 78, 71, 13, 10, 26, 10]), chunk('IHDR', ihdr), chunk('IDAT', deflateSync(raw)), chunk('IEND', Buffer.alloc(0))]));

  const objs = ['<< /Type /Catalog /Pages 2 0 R >>', '<< /Type /Pages /Kids [3 0 R] /Count 1 >>', '<< /Type /Page /Parent 2 0 R /MediaBox [0 0 595 842] /Contents 4 0 R /Resources << /Font << /F1 5 0 R >> >> >>', null, '<< /Type /Font /Subtype /Type1 /BaseFont /Helvetica >>'];
  const text = 'BT /F1 36 Tf 72 740 Td (DropRoom handout) Tj ET';
  objs[3] = `<< /Length ${text.length} >>\nstream\n${text}\nendstream`;
  let pdf = '%PDF-1.4\n';
  const offs = objs.map((o, i) => { const off = pdf.length; pdf += `${i + 1} 0 obj\n${o}\nendobj\n`; return off; });
  const xref = pdf.length;
  pdf += `xref\n0 ${objs.length + 1}\n0000000000 65535 f \n${offs.map((o) => String(o).padStart(10, '0') + ' 00000 n \n').join('')}trailer\n<< /Size ${objs.length + 1} /Root 1 0 R >>\nstartxref\n${xref}\n%%EOF\n`;
  writeFileSync(PDF, pdf);
  writeFileSync(NOTES, 'hello from P2P '.repeat(20000));
}
const sleep = (ms) => new Promise((r) => setTimeout(r, ms));
const log = (...a) => console.log('•', ...a);

// test files

const browser = await puppeteer.launch({
  executablePath: process.env.CHROME_PATH ?? '/usr/bin/google-chrome',
  headless: true,
  args: ['--no-sandbox', '--use-fake-ui-for-media-stream', '--allow-loopback-in-peer-connection'],
});

const ctxA = await browser.createBrowserContext();
const ctxB = await browser.createBrowserContext();
const A = await ctxA.newPage();
const B = await ctxB.newPage();
for (const [p, n] of [[A, 'A'], [B, 'B']]) {
  p.on('pageerror', (e) => console.log(`[${n} pageerror]`, e.message));
  p.on('console', (m) => m.type() === 'error' && console.log(`[${n} console]`, m.text()));
}
await A.setViewport({ width: 1280, height: 860 });
await B.setUserAgent('Mozilla/5.0 (iPhone; CPU iPhone OS 18_0 like Mac OS X) AppleWebKit/605.1.15 (KHTML, like Gecko) Version/18.0 Mobile/15E148 Safari/604.1');
await B.setViewport({ width: 390, height: 844, isMobile: true, hasTouch: true, deviceScaleFactor: 2 });

const clickText = async (page, text, sel = 'button') => {
  const ok = await page.evaluate(
    (text, sel) => {
      const el = [...document.querySelectorAll(sel)].find((e) => e.textContent?.includes(text) && e.offsetParent !== null);
      el?.click();
      return !!el;
    },
    text,
    sel,
  );
  if (!ok) throw new Error(`no ${sel} with "${text}"`);
};
const waitText = (page, text, timeout = 10000) => page.waitForFunction((t) => document.body.innerText.includes(t), { timeout }, text);

// ---- Home
await A.goto(WEB, { waitUntil: 'networkidle0' });
await sleep(600);
await A.screenshot({ path: `${OUT}/01-home-desktop.png` });
await B.goto(WEB, { waitUntil: 'networkidle0' });
await B.emulateMediaFeatures([{ name: 'prefers-color-scheme', value: 'dark' }]);
await sleep(600);
await B.screenshot({ path: `${OUT}/02-home-mobile-dark.png` });
log('home ok');

// ---- Create room on A
await clickText(A, 'สร้างห้อง', 'button');
await A.waitForFunction(() => location.pathname.startsWith('/r/'), { timeout: 10000 });
const code = A.url().split('/r/')[1];
await waitText(A, 'ห้องว่าง');
await sleep(500);
await A.screenshot({ path: `${OUT}/03-room-empty.png` });
log('created', code);

// ---- Join on B via code
await B.goto(WEB, { waitUntil: 'networkidle0' });
await B.type('input[aria-label="รหัสห้อง"]', code.toLowerCase().replace('-', ''));
await clickText(B, 'เข้าห้อง');
await B.waitForFunction(() => location.pathname.startsWith('/r/'), { timeout: 10000 });
await A.waitForFunction(() => document.querySelector('[aria-label$="อุปกรณ์ในห้อง"]')?.textContent?.includes('2'), { timeout: 10000 });
log('B joined, A sees 2 devices');

// ---- Text with link
const t0 = Date.now();
await A.type('textarea', 'ลิงก์งาน https://example.com/assignment?id=42 ส่งภายในวันศุกร์');
await A.keyboard.press('Enter');
await waitText(B, 'ส่งภายในวันศุกร์');
log('text delivered in', Date.now() - t0, 'ms');
const hasLink = await B.evaluate(() => !!document.querySelector('a[href="https://example.com/assignment?id=42"][rel~="noopener"]'));
log('link clickable:', hasLink);

// ---- Code
await clickText(A, 'โค้ด');
await A.type('textarea', 'def greet(name):\n    return f"สวัสดี {name}"\n\nprint(greet("ภูเขียว"))');
await A.keyboard.down('Control');
await A.keyboard.press('Enter');
await A.keyboard.up('Control');
await waitText(B, 'Copy Code');
const hl = await B.evaluate(() => document.querySelectorAll('.hljs .hljs-keyword').length);
log('code highlighted tokens:', hl);

// ---- JSON
await clickText(A, 'ข้อความ');
await A.type('textarea', '{"student":"ภู","score":[18,19,20],"pass":true}');
await A.keyboard.press('Enter');
await waitText(B, 'จัดรูปแบบ JSON');
await clickText(B, 'จัดรูปแบบ JSON');
log('json formatter ok');

// ---- B uploads image via file input
const [input] = await B.$$('input[type=file]');
await input.uploadFile(PHOTO, PDF);
await A.waitForFunction(() => document.body.innerText.includes('photo.png'), { timeout: 15000 });
await A.waitForFunction(() => document.body.innerText.includes('handout.pdf'), { timeout: 15000 });
await A.waitForFunction(() => [...document.querySelectorAll('img')].filter((i) => i.src.startsWith('data:image/')).length >= 2, { timeout: 5000 });
log('upload + thumbnail ok');

// ---- Paste a screenshot on A
await A.evaluate(async () => {
  const blob = await fetch(document.querySelector('img[src^="data:image/"]').src).then((r) => r.blob());
  const dt = new DataTransfer();
  dt.items.add(new File([blob], 'image.png', { type: 'image/png' }));
  window.dispatchEvent(new ClipboardEvent('paste', { clipboardData: dt, bubbles: true }));
});
await waitText(B, 'screenshot-', 15000);
log('paste screenshot ok');

// ---- Preview image on A
await clickText(A, 'ดู');
await A.waitForFunction(() => [...document.querySelectorAll('[role=dialog] img')].some((i) => i.complete && i.naturalWidth > 0), { timeout: 8000 });
await sleep(400);
await A.screenshot({ path: `${OUT}/04-preview.png` });
await A.keyboard.press('Escape');
log('preview ok');

// ---- Burn after reading (1 open)
await A.click('[aria-label="เผาหลังอ่าน"]');
await clickText(A, '1 ครั้ง');
await A.type('textarea', 'รหัส Wi-Fi ห้องแล็บ: PK-Lab-2569');
await A.keyboard.press('Enter');
await waitText(B, 'แตะเพื่อเปิดอ่าน');
await clickText(B, 'แตะเพื่อเปิดอ่าน');
await waitText(B, 'PK-Lab-2569');
await waitText(A, 'เหลือ 0/1');
log('burn-after-reading ok');

// ---- P2P direct transfer A -> B
await A.click('[aria-label$="อุปกรณ์ในห้อง"]');
await waitText(A, 'ส่งตรง');
const [chooser] = await Promise.all([A.waitForFileChooser({ timeout: 5000 }), clickText(A, 'ส่งตรง')]);
await chooser.accept([NOTES]);
await waitText(B, 'ต้องการส่งไฟล์โดยตรง');
await B.screenshot({ path: `${OUT}/05-p2p-request-mobile.png` });
await clickText(B, 'รับไฟล์');
await B.waitForFunction(() => document.body.innerText.includes('ส่งตรง (P2P) จาก'), { timeout: 20000 });
await A.waitForFunction(() => document.body.innerText.includes('ส่งตรง (P2P) ถึง'), { timeout: 20000 });
log('p2p transfer ok');

await sleep(800);
await A.screenshot({ path: `${OUT}/06-room-desktop.png` });
await B.screenshot({ path: `${OUT}/07-room-mobile-dark.png` });

// ---- Share + settings sheets
await A.click('[aria-label="แชร์ห้อง"]');
await sleep(700);
await A.screenshot({ path: `${OUT}/08-share.png` });
await A.keyboard.press('Escape');
await A.click('[aria-label="ตั้งค่า"]');
await sleep(600);
await A.screenshot({ path: `${OUT}/09-settings.png` });

// ---- broadcast mode blocks B
await A.click('[aria-label="โหมดกระจายสัญญาณ"]');
await waitText(B, 'โหมดกระจายสัญญาณ');
log('broadcast mode ok');

// ---- Nuke
A.on('dialog', (d) => d.accept());
await clickText(A, 'ทำลายห้องทันที');
await waitText(B, 'ห้องนี้ถูกลบแล้ว');
await B.screenshot({ path: `${OUT}/10-ended-mobile.png` });
log('nuke ok');

await browser.close();
log('ALL PASSED');
