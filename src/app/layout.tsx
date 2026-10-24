import type { Metadata, Viewport } from 'next';
import { Atkinson_Hyperlegible } from 'next/font/google';
import './globals.css';

// Atkinson Hyperlegible (Braille Institute) was drawn for low-vision readers: distinct letterforms
// (I/l/1, O/0, b/d) that hold up at a distance. Downloaded at build time and self-served by Next.
const atkinson = Atkinson_Hyperlegible({
  weight: ['400', '700'],
  subsets: ['latin'],
  display: 'swap',
  variable: '--font-atkinson',
});

export const metadata: Metadata = {
  title: 'Still Here',
  description: 'Your words. Your choice. AI offers possible words. The person decides what to say.',
  applicationName: 'Still Here',
  // Home Screen install (docs/IPAD_HOME_SCREEN.md). The manifest (app/manifest.ts) is linked
  // automatically. statusBarStyle 'default' keeps status-bar text legible on the light theme;
  // 'black-translucent' would draw white text over the light --bg.
  appleWebApp: { capable: true, title: 'Still Here', statusBarStyle: 'default' },
  // Next emits only `mobile-web-app-capable`; older iPadOS (pre-16.4, before manifest support)
  // needs the legacy Apple name to launch standalone.
  other: { 'apple-mobile-web-app-capable': 'yes' },
};

export const viewport: Viewport = {
  width: 'device-width',
  initialScale: 1,
  // Draw under the iPad home indicator / rounded corners; globals.css pads with env(safe-area-inset-*).
  // Pinch-zoom stays allowed (no maximumScale / userScalable lock).
  viewportFit: 'cover',
  colorScheme: 'light dark',
  themeColor: [
    { media: '(prefers-color-scheme: light)', color: '#f5f4f0' },
    { media: '(prefers-color-scheme: dark)', color: '#111315' },
  ],
};

export default function RootLayout({ children }: Readonly<{ children: React.ReactNode }>) {
  return (
    <html lang="en" className={atkinson.variable}>
      <body>{children}</body>
    </html>
  );
}
