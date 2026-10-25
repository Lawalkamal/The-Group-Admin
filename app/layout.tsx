import type { Metadata, Viewport } from 'next';
import '@fontsource-variable/instrument-sans';
import './globals.css';
import { PhoneFrame } from '@/components/PhoneFrame';

export const metadata: Metadata = {
  title: 'The Group Admin',
  description: 'Private communities for real conversations, party plans, and shared goals.',
  applicationName: 'The Group Admin',
};

export const viewport: Viewport = {
  width: 'device-width',
  initialScale: 1,
  maximumScale: 1,
  themeColor: '#ffffff',
};

export default function RootLayout({ children }: { children: React.ReactNode }) {
  return (
    <html lang="en">
      <body>
        <PhoneFrame>{children}</PhoneFrame>
      </body>
    </html>
  );
}
