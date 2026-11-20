import type { Metadata } from 'next';

export const metadata: Metadata = {
  title: 'ห้อง DropRoom',
  robots: { index: false, follow: false },
};

export default function RoomLayout({ children }: { children: React.ReactNode }) {
  return children;
}
