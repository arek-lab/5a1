import { Frank_Ruhl_Libre, Public_Sans, IBM_Plex_Sans, IBM_Plex_Mono } from 'next/font/google';

export const frankRuhlLibre = Frank_Ruhl_Libre({
  subsets: ['latin', 'latin-ext'],
  weight: ['500', '600'],
  display: 'swap',
  variable: '--font-frank-ruhl-libre',
});

export const publicSans = Public_Sans({
  subsets: ['latin', 'latin-ext'],
  weight: ['400', '500', '600'],
  display: 'swap',
  variable: '--font-public-sans',
});

export const ibmPlexSans = IBM_Plex_Sans({
  subsets: ['latin', 'latin-ext'],
  weight: ['400', '500', '600'],
  display: 'swap',
  variable: '--font-ibm-plex-sans',
});

export const ibmPlexMono = IBM_Plex_Mono({
  subsets: ['latin', 'latin-ext'],
  weight: ['400', '500'],
  display: 'swap',
  variable: '--font-ibm-plex-mono',
});
