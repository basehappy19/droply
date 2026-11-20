import type { Metadata, Viewport } from 'next';
import { Anuphan, JetBrains_Mono } from 'next/font/google';
import { Background, ToastProvider } from '@/components/ui';
import './globals.css';

const fontAnuphan = Anuphan({
  subsets: ['thai', 'latin'],
  weight: ['400', '500', '600', '700'],
  variable: '--font-anuphan',
  display: 'swap',
});

const fontMono = JetBrains_Mono({
  subsets: ['latin'],
  weight: ['400', '500', '600', '700'],
  variable: '--font-code',
  display: 'swap',
});

const siteUrl = (process.env.NEXT_PUBLIC_SITE_URL || 'http://localhost:3000').replace(/\/$/, '');
const siteTitle = 'DropRoom — ส่งข้อความ โค้ด และไฟล์ข้ามอุปกรณ์แบบชั่วคราว';
const siteDescription =
  'ส่งข้อความ โค้ด ลิงก์ และไฟล์ข้ามอุปกรณ์ผ่านเว็บเบราว์เซอร์ได้ทันที ไม่ต้องสมัครสมาชิก รองรับ QR Code, Direct P2P และลบข้อมูลอัตโนมัติตามเวลา';

export const metadata: Metadata = {
  metadataBase: new URL(siteUrl),
  title: {
    default: siteTitle,
    template: '%s | DropRoom',
  },
  description: siteDescription,
  applicationName: 'DropRoom',
  keywords: [
    'DropRoom',
    'ส่งไฟล์ข้ามอุปกรณ์',
    'ส่งข้อความข้ามเครื่อง',
    'แชร์ไฟล์ชั่วคราว',
    'แชร์โค้ด',
    'P2P file transfer',
    'ephemeral sharing',
    'cross-device clipboard',
    'QR file share',
  ],
  authors: [{ name: 'DropRoom' }],
  creator: 'DropRoom',
  publisher: 'DropRoom',
  alternates: {
    canonical: '/',
  },
  openGraph: {
    type: 'website',
    locale: 'th_TH',
    url: '/',
    siteName: 'DropRoom',
    title: siteTitle,
    description: siteDescription,
  },
  twitter: {
    card: 'summary_large_image',
    title: siteTitle,
    description: siteDescription,
  },
  robots: {
    index: true,
    follow: true,
    googleBot: {
      index: true,
      follow: true,
      'max-image-preview': 'large',
      'max-snippet': -1,
      'max-video-preview': -1,
    },
  },
  formatDetection: {
    telephone: false,
    address: false,
    email: false,
  },
  appleWebApp: {
    capable: true,
    title: 'DropRoom',
    statusBarStyle: 'black-translucent',
  },
};

export const viewport: Viewport = {
  width: 'device-width',
  initialScale: 1,
  viewportFit: 'cover',
  interactiveWidget: 'resizes-content',
  themeColor: [
    { media: '(prefers-color-scheme: light)', color: '#eef2f9' },
    { media: '(prefers-color-scheme: dark)', color: '#05070d' },
  ],
};

const jsonLd = {
  '@context': 'https://schema.org',
  '@type': 'WebApplication',
  name: 'DropRoom',
  url: siteUrl,
  description: siteDescription,
  applicationCategory: 'UtilitiesApplication',
  operatingSystem: 'All',
  inLanguage: 'th',
  isAccessibleForFree: true,
  offers: {
    '@type': 'Offer',
    price: '0',
    priceCurrency: 'THB',
  },
};

export default function RootLayout({ children }: { children: React.ReactNode }) {
  return (
    <html lang="th" className={`${fontAnuphan.variable} ${fontMono.variable}`}>
      <body className="min-h-dvh font-sans antialiased">
        <script type="application/ld+json" dangerouslySetInnerHTML={{ __html: JSON.stringify(jsonLd) }} />
        <Background />
        <ToastProvider>{children}</ToastProvider>
      </body>
    </html>
  );
}
