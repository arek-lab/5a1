import type { Metadata, Viewport } from 'next';
import Script from 'next/script';
import { Providers } from './providers';
import { frankRuhlLibre, publicSans, ibmPlexSans, ibmPlexMono } from './fonts';
import { COLOR_SCHEME_INIT_SCRIPT } from '@/lib/theme/color-scheme';
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
      <head>
        <Script
          id="color-scheme-init"
          strategy="beforeInteractive"
          dangerouslySetInnerHTML={{ __html: COLOR_SCHEME_INIT_SCRIPT }}
        />
      </head>
      <body>
        <Providers>{children}</Providers>
      </body>
    </html>
  );
}
