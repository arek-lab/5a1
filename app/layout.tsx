import type { Metadata } from 'next';
import './globals.css';

export const metadata: Metadata = {
  title: 'Hotel Guest App',
  description: 'Hotel guest experience platform',
};

export default function RootLayout({ children }: { children: React.ReactNode }) {
  return (
    <html suppressHydrationWarning>
      <body>{children}</body>
    </html>
  );
}
