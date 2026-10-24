import type { Metadata, Viewport } from 'next';
import './globals.css';

export const metadata: Metadata = {
  title: 'Still Here',
  description: 'Your words. Your choice. AI offers possible words. The person decides what to say.',
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
    <html lang="en">
      <body>{children}</body>
    </html>
  );
}
