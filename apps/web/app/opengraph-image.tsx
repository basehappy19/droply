import { ImageResponse } from 'next/og';

export const alt = 'DropRoom — ส่งข้อความ โค้ด ลิงก์ และไฟล์ข้ามอุปกรณ์แบบชั่วคราว';
export const size = { width: 1200, height: 630 };
export const contentType = 'image/png';

export default function OpenGraphImage() {
  return new ImageResponse(
    (
      <div
        style={{
          width: '100%',
          height: '100%',
          display: 'flex',
          flexDirection: 'column',
          alignItems: 'center',
          justifyContent: 'center',
          backgroundColor: '#05070d',
          backgroundImage:
            'radial-gradient(circle at 18% 18%, rgba(10, 132, 255, 0.36) 0%, transparent 52%), radial-gradient(circle at 82% 20%, rgba(118, 75, 230, 0.32) 0%, transparent 50%), radial-gradient(circle at 52% 92%, rgba(48, 209, 88, 0.18) 0%, transparent 50%)',
          fontFamily: 'system-ui, -apple-system, sans-serif',
          color: '#f5f7fc',
          padding: 64,
        }}
      >
        {/* Liquid Glass card */}
        <div
          style={{
            display: 'flex',
            flexDirection: 'column',
            alignItems: 'center',
            justifyContent: 'center',
            width: '100%',
            height: '100%',
            borderRadius: 44,
            background: 'rgba(26, 30, 42, 0.64)',
            border: '1.5px solid rgba(255, 255, 255, 0.18)',
            boxShadow: '0 32px 80px rgba(0, 0, 0, 0.65)',
            padding: '48px 64px',
          }}
        >
          {/* App Icon */}
          <div
            style={{
              width: 112,
              height: 112,
              borderRadius: 30,
              display: 'flex',
              alignItems: 'center',
              justifyContent: 'center',
              background: 'linear-gradient(135deg, #38bdf8 0%, #0a84ff 48%, #4f46e5 100%)',
              boxShadow: '0 20px 50px rgba(10, 132, 255, 0.5)',
              marginBottom: 28,
            }}
          >
            <svg width="72" height="72" viewBox="0 0 64 64" fill="none">
              <path d="M16 39a17.5 17.5 0 1 1 32 0" stroke="rgba(255,255,255,0.42)" strokeWidth="3.5" strokeLinecap="round" />
              <path d="M32 46V19m0 0-10 10M32 19l10 10" stroke="#ffffff" strokeWidth="5.4" strokeLinecap="round" strokeLinejoin="round" />
              <circle cx="32" cy="53" r="3.2" fill="#ffffff" />
            </svg>
          </div>

          <div style={{ fontSize: 68, fontWeight: 800, letterSpacing: '-0.03em', lineHeight: 1.1 }}>DropRoom</div>
          <div style={{ fontSize: 28, color: '#a1abc0', marginTop: 14, textAlign: 'center' }}>
            Instant Cross-Device Ephemeral Sharing · Text, Code &amp; Files
          </div>

          {/* Pills */}
          <div style={{ display: 'flex', gap: 16, marginTop: 38 }}>
            {['No Login', 'QR & Room Code', 'Direct P2P + Cloud', 'Auto-Expire'].map((label) => (
              <div
                key={label}
                style={{
                  display: 'flex',
                  alignItems: 'center',
                  padding: '12px 24px',
                  borderRadius: 999,
                  background: 'rgba(255, 255, 255, 0.08)',
                  border: '1px solid rgba(255, 255, 255, 0.16)',
                  fontSize: 20,
                  fontWeight: 600,
                  color: '#e5ebf7',
                }}
              >
                {label}
              </div>
            ))}
          </div>
        </div>
      </div>
    ),
    { ...size },
  );
}
