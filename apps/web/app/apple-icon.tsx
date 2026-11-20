import { ImageResponse } from 'next/og';

export const size = { width: 180, height: 180 };
export const contentType = 'image/png';

export default function AppleIcon() {
  return new ImageResponse(
    (
      <div
        style={{
          width: '100%',
          height: '100%',
          display: 'flex',
          alignItems: 'center',
          justifyContent: 'center',
          background: 'linear-gradient(135deg, #38bdf8 0%, #0a84ff 48%, #4f46e5 100%)',
          borderRadius: 40,
          position: 'relative',
          overflow: 'hidden',
        }}
      >
        <div
          style={{
            position: 'absolute',
            top: 0,
            left: 0,
            right: 0,
            height: 86,
            background: 'linear-gradient(180deg, rgba(255,255,255,0.38) 0%, rgba(255,255,255,0) 100%)',
          }}
        />
        <svg width="128" height="128" viewBox="0 0 64 64" fill="none">
          <path d="M16 39a17.5 17.5 0 1 1 32 0" stroke="rgba(255,255,255,0.38)" strokeWidth="3.5" strokeLinecap="round" />
          <path d="M32 46V19m0 0-10 10M32 19l10 10" stroke="#ffffff" strokeWidth="5.4" strokeLinecap="round" strokeLinejoin="round" />
          <circle cx="32" cy="53" r="3.2" fill="#ffffff" />
        </svg>
      </div>
    ),
    { ...size },
  );
}
