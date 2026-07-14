import type { Metadata, Viewport } from 'next';
import { Providers } from './providers';
import { frankRuhlLibre, publicSans, ibmPlexSans, ibmPlexMono } from './fonts';
import './globals.css';

export const metadata: Metadata = {
  title: 'Hotel Guest App',
  description: 'Hotel guest experience platform',
  icons: {
    apple: '/icons/apple-touch-icon.png',
  },
};

export const viewport: Viewport = {
  width: 'device-width',
  initialScale: 1,
  themeColor: '#111827',
};

const fontVariables = `${frankRuhlLibre.variable} ${publicSans.variable} ${ibmPlexSans.variable} ${ibmPlexMono.variable}`;

export default function RootLayout({ children }: { children: React.ReactNode }) {
  return (
    <html suppressHydrationWarning className={fontVariables}>
      <body>
        <Providers>{children}</Providers>
      </body>
    </html>
  );
}
