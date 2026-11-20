# DropRoom — แพลตฟอร์มส่งข้อความและไฟล์ข้ามอุปกรณ์แบบชั่วคราว

เว็บแอปสำหรับส่งข้อความ โค้ด ลิงก์ และไฟล์ข้ามอุปกรณ์ ใช้ผ่านเบราว์เซอร์ ไม่ต้องสมัครสมาชิก และข้อมูลทั้งหมดลบตัวเองตามอายุห้อง
พัฒนาตาม PRD v1.1 (Cross-Device Ephemeral Sharing Platform)

```
apps/
  server/   Node.js + Fastify + Socket.IO + Redis  (API, realtime, P2P signaling, cleanup worker)
  web/      Next.js 16 + React 19 + Tailwind CSS 4 (UI สไตล์ iOS)
e2e/        ทดสอบอัตโนมัติด้วยเบราว์เซอร์ 2 เครื่อง (Puppeteer)
```

## ฟีเจอร์

| PRD | ฟีเจอร์ | สถานะ |
|---|---|---|
| 3.1 | สร้างห้อง, รหัส `คำ-ตัวเลข 3 หลัก` (≈1.07 ล้านแบบ), เข้าด้วยรหัส / QR / ลิงก์ | ✅ |
| 3.1 | Rate limit กรอกรหัสหรือรหัสผ่านผิด 10 ครั้ง/นาที → ระงับ 15 นาที | ✅ |
| 3.1 | Owner Token + ลิงก์เจ้าของ (โอนสิทธิ์ผ่าน QR), จำกัด 50 เครื่อง/ห้อง | ✅ |
| 3.1 | Presence: จำนวนเครื่องและชนิดอุปกรณ์, เปลี่ยนชื่อเครื่อง, รีเฟรชแล้วยังเป็นเครื่องเดิม | ✅ |
| 3.2 | ข้อความ + ลิงก์คลิกได้, โค้ด + Syntax Highlight (21 ภาษา, ตรวจจับอัตโนมัติ) + Copy Code | ✅ |
| 3.2 | ไฟล์ทุกชนิด (100 MB/ไฟล์, 500 MB/ห้อง), ลากวาง, Ctrl/⌘+V วางภาพหน้าจอ/ไฟล์ | ✅ |
| 3.2 | Thumbnail รูป / PDF หน้าแรก / วิดีโอ สร้างที่เครื่องผู้ส่ง, ดูรูป/วิดีโอ/เสียง/PDF ในหน้าเว็บ | ✅ |
| 3.3 | Cloud Relay: Multipart อัปโหลดชิ้นละ 8 MB ขนาน 3 ชิ้น, ลองต่อเมื่อเน็ตหลุด | ✅ |
| 3.3 | Direct P2P (WebRTC DataChannel) ไม่จำกัดขนาด, ถ้าล้มเหลวเสนอให้ส่งผ่าน Cloud | ✅ |
| 3.4 | TTL 15 นาที / 1 ชั่วโมง / 24 ชั่วโมง, Empty Room Auto-Delete (ผ่อนผัน 15 นาที), นับถอยหลังและเตือนก่อนหมด 5 นาที | ✅ |
| 3.4 | ปุ่ม Nuke (ค่าเริ่มต้นเฉพาะเจ้าของ), รหัสผ่านห้อง (เก็บเป็น hash) | ✅ |
| 4.2 | Broadcast Mode (เฉพาะเจ้าของห้องส่งได้) | ✅ |
| 4.5 | JSON Formatter, ข้อความ→QR, ดาวน์โหลดทั้งหมดเป็น ZIP (บีบอัดที่เครื่องผู้ใช้) | ✅ |
| 4.6 | Lock Room, Burn-after-reading/download 1–50 ครั้ง (นับแบบ atomic ฝั่ง server) | ✅ |
| 4.7 | Secure Room (เข้ารหัส E2E) | ⏳ ยังไม่ทำ (ระยะที่ 2) |

## เริ่มใช้งานบนเครื่อง (Development)

ต้องมี **Node.js 22+** และ **Redis**

```bash
# 1) เปิด Redis (เลือกวิธีใดวิธีหนึ่ง)
docker compose up -d redis          # ถ้ามี Docker
# หรือ sudo apt install redis-server / brew install redis

# 2) ติดตั้งและรัน
npm install
cp apps/server/.env.example apps/server/.env
npm run dev
```

- เว็บ: http://localhost:3000
- API/Realtime: http://localhost:4000

**ทดสอบกับมือถือในวง LAN เดียวกัน:** ตั้ง `CORS_ORIGIN=*` ใน `apps/server/.env` แล้วเปิด `http://<IP เครื่องคอม>:3000` บนมือถือ เว็บจะเรียก server ที่ `<IP เดียวกัน>:4000` ให้อัตโนมัติ
ข้อจำกัดของ http บน LAN: ปุ่มคัดลอกยังใช้ได้ (มี fallback) แต่ "คัดลอกรูป" และปุ่ม "แชร์" ของระบบต้องใช้ HTTPS

## ติดตั้งใช้งานจริง (Production)

### ทางเลือก A — เครื่องเดียว (VPS / homelab) ด้วย Docker Compose

```bash
cp apps/server/.env.example apps/server/.env    # แก้ APP_SECRET, CORS_ORIGIN, STORAGE ฯลฯ
NEXT_PUBLIC_SERVER_URL=https://api.drop.example.com \
  docker compose -f docker-compose.prod.yml up -d --build
```

ต้องวาง reverse proxy ที่มี TLS ไว้ด้านหน้า เพราะ PRD กำหนด HTTPS/WSS ตัวอย่าง `Caddyfile`:

```
drop.example.com {
  reverse_proxy localhost:3000
}
api.drop.example.com {
  reverse_proxy localhost:4000
}
```

Caddy รองรับ WebSocket และออกใบรับรอง TLS ให้อัตโนมัติ ถ้าใช้ Cloudflare Tunnel ให้ชี้ 2 hostname ไปที่พอร์ต 3000 และ 4000 ตามลำดับ

### ทางเลือก B — แยกส่วน

- **web** → Vercel โดยตั้ง Root Directory = `apps/web` และ env `NEXT_PUBLIC_SERVER_URL`
- **server** → VPS/Container ใดก็ได้ที่รองรับ WebSocket ต่อเนื่อง (Vercel รันส่วนนี้ไม่ได้) และควรอยู่ภูมิภาคเดียวกับผู้ใช้ เช่น สิงคโปร์
- **Redis** → ภูมิภาคเดียวกับ server และปิดการบันทึกลงดิสก์ (`--save "" --appendonly no`)

### ตั้งค่า Cloudflare R2 (`STORAGE=s3`)

1. สร้าง bucket เช่น `droproom` แล้วสร้าง R2 API Token สิทธิ์ Object Read & Write
2. ตั้งค่าใน `.env`: `S3_ENDPOINT=https://<ACCOUNT_ID>.r2.cloudflarestorage.com`, `S3_REGION=auto`, คีย์ทั้งสอง
3. ตั้ง **CORS** ของ bucket (จำเป็น เพราะเบราว์เซอร์อัปโหลดตรงเข้า R2 และต้องอ่าน `ETag` ได้):
   ```json
   [{ "AllowedOrigins": ["https://drop.example.com"], "AllowedMethods": ["GET", "PUT"],
      "AllowedHeaders": ["*"], "ExposeHeaders": ["ETag"], "MaxAgeSeconds": 3600 }]
   ```
4. ตั้ง **Lifecycle Rules** เป็นตาข่ายสำรอง (ปกติ Cleanup Worker ลบไฟล์ภายใน 1 นาทีอยู่แล้ว):
   - Delete objects with prefix `rooms/` after **1 day**
   - Abort incomplete multipart uploads after **1 day**

### WebRTC / TURN

ค่าเริ่มต้นใช้ STUN สาธารณะ ซึ่งพอสำหรับเครือข่ายส่วนใหญ่ แต่ถ้าอุปกรณ์อยู่หลัง NAT/ไฟร์วอลล์ที่เข้มงวด (เครือข่ายองค์กร, 4G บางเจ้า) ต้องมี TURN เช่น coturn แล้วตั้ง `TURN_URLS`, `TURN_USERNAME`, `TURN_CREDENTIAL` ถ้าการส่งตรงไม่สำเร็จ ระบบจะเสนอให้ส่งผ่าน Cloud แทน

### รัน Cleanup Worker แยก (เมื่อมี server หลาย instance)

ตั้ง `INLINE_WORKER=false` บนทุก instance แล้วรัน `npm run worker -w apps/server` แยกต่างหาก
ถึงจะเผลอรันซ้ำหลายตัวก็ไม่เป็นปัญหา เพราะแต่ละงานถูกจองด้วย `ZREM` แบบ atomic

## ค่ากำหนดหลัก (`apps/server/.env`)

| ตัวแปร | ค่าเริ่มต้น | ความหมาย |
|---|---|---|
| `CORS_ORIGIN` | `http://localhost:3000` | โดเมนเว็บที่อนุญาต (คั่นด้วย `,` หรือ `*` สำหรับทดสอบ) |
| `REDIS_URL` | `redis://localhost:6379` | |
| `APP_SECRET` | — | ใช้เซ็นลิงก์ไฟล์และ hash IP **ต้องตั้งใน production** |
| `TRUST_PROXY` | `false` | ตั้ง `true` เมื่ออยู่หลัง proxy เพื่อให้ rate limit เห็น IP จริง |
| `STORAGE` | `local` | `local` (ดิสก์) หรือ `s3` (R2/S3/MinIO) |
| `MAX_FILE_MB` / `MAX_ROOM_MB` | 100 / 500 | ขีดจำกัดไฟล์ผ่าน Cloud |
| `MAX_MEMBERS` | 50 | อุปกรณ์สูงสุดต่อห้อง |
| `EMPTY_GRACE_SEC` | 900 | ระยะผ่อนผันก่อนลบห้องว่าง |
| `ROOMS_PER_HOUR` / `UPLOAD_MB_PER_DAY` | 20 / 2048 | rate limit ต่อ IP |

## การทดสอบ

```bash
# Integration test ของ server (ต้องรัน server ไว้)
npm run dev -w apps/server
SERVER_URL=http://localhost:4000 npm test -w apps/server

# E2E: เบราว์เซอร์ 2 เครื่อง (เดสก์ท็อป + iPhone โหมดมืด) ทดสอบทุกฟีเจอร์หลัก
npm run build && npm start
cd e2e && npm install && CHROME_PATH=/usr/bin/google-chrome npm test   # ภาพหน้าจออยู่ใน e2e/shots/
```

## ประสิทธิภาพ (Lighthouse, production build)

| หน้า | Performance (มือถือ / เดสก์ท็อป) | Accessibility | Best Practices | SEO |
|---|---|---|---|---|
| หน้าแรก `/` | 91 / 100 | 100 | 100 | 100 |
| ห้อง `/r/CODE` | 90 / 100 | 100 | 100 | 60 (ตั้งใจ `noindex` ตาม PRD 5.4) |

สิ่งที่ทำเพื่อให้ลื่น:
- ไม่มีพื้นหลังเคลื่อนไหวหรือ `filter: blur` ขนาดใหญ่ ใช้ `backdrop-filter` แค่แถบหัวและช่องพิมพ์
- ใช้ฟอนต์ของระบบ ไม่โหลด webfont และฝัง CSS ไว้ในหน้า (`inlineCss`)
- โหลด highlight.js, QR และ ZIP เมื่อจำเป็นเท่านั้น
- ห้องแสดงโครงหน้าทันทีระหว่างเชื่อมต่อ (LCP 0.8 วินาที) และใช้ `content-visibility` กับรายการข้อความ

คะแนนมือถือที่เหลือมาจากเวลารัน React/Next.js ภายใต้การจำลอง CPU ช้า 4 เท่า

## สถาปัตยกรรมโดยย่อ

- **Redis keys** ทั้งหมดของห้องตั้ง `PEXPIREAT` เท่ากับเวลาหมดอายุของห้อง และมี sorted set `expiries` ให้ worker ใช้ลบไฟล์ใน storage ตามเวลา
- **การอัปโหลด**: `POST /api/files/init` → เบราว์เซอร์ `PUT` แต่ละชิ้นตรงไปยัง R2 ผ่าน presigned URL → `POST /api/files/complete`
- **การดาวน์โหลด**: `POST /api/files/url` ออก URL อายุ 60 วินาที (สำหรับไฟล์ Burn-after-download จะลดตัวนับก่อนออก URL ทุกครั้ง)
- **ความปลอดภัยของไฟล์**: ส่ง `Content-Disposition: attachment` ยกเว้นรูป วิดีโอ เสียง และ PDF ที่ขอดูตัวอย่าง พร้อม `nosniff` และ CSP แบบ `sandbox` (ในโหมด local) ส่วนเว็บส่ง `X-Robots-Tag: noindex`
- **ไม่บันทึกเนื้อหาใน log** และ hash IP ด้วย salt ที่เปลี่ยนทุกวันก่อนใช้เป็น key ของ rate limit

## ข้อจำกัดและสิ่งที่ยังไม่ได้ทำ

- **Secure Room (E2E, PRD 4.7):** ยังไม่ทำ ตอนนี้เนื้อหาเข้ารหัสระหว่างทางด้วย TLS แต่ server/R2 ยังอ่านได้
- **รหัสผ่านห้อง:** ใช้ `scrypt` ที่มีใน Node อยู่แล้ว แทน Argon2id เพื่อไม่ต้องพึ่ง native module (ความแข็งแรงใกล้เคียงกัน)
- **ข้อมูลจราจร 90 วัน (PRD 5.3):** ยังไม่ได้ทำระบบเก็บ log แยก เพราะต้องรอฝ่ายกฎหมายยืนยันขอบเขตก่อน
- **Formatter:** จัดรูปแบบได้เฉพาะ JSON ภาษาอื่นต้องใช้ Prettier ซึ่งทำให้ bundle ใหญ่ขึ้นมาก
- **ไฟล์ที่รับแบบ P2P และไฟล์ ZIP:** ประกอบไฟล์ในหน่วยความจำของเบราว์เซอร์ จึงไม่เหมาะกับไฟล์ระดับหลาย GB บนมือถือ
- **Empty Room Auto-Delete:** ถ้า server instance ล่มกะทันหัน ตัวนับการเชื่อมต่ออาจค้าง ทำให้ห้องไม่ถูกนับว่าว่าง แต่ห้องจะยังถูกลบตาม TTL ตามปกติ
