import type { MetadataRoute } from 'next';

export default function manifest(): MetadataRoute.Manifest {
  return {
    name: 'DropRoom — ส่งข้อความและไฟล์ข้ามอุปกรณ์',
    short_name: 'DropRoom',
    description: 'ส่งข้อความ โค้ด ลิงก์ และไฟล์ข้ามอุปกรณ์ผ่านเว็บเบราว์เซอร์ ไม่ต้องสมัคร ข้อมูลลบตัวเองตามเวลา',
    start_url: '/',
    display: 'standalone',
    background_color: '#05070d',
    theme_color: '#0a84ff',
    lang: 'th',
    icons: [
      { src: '/icon.svg', sizes: 'any', type: 'image/svg+xml' },
      { src: '/apple-icon', sizes: '180x180', type: 'image/png' },
    ],
  };
}
