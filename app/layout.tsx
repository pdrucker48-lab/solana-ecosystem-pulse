import type { Metadata } from 'next';
import { Geist, Geist_Mono } from 'next/font/google';
import './globals.css';

const geistSans = Geist({
  variable: '--font-geist-sans',
  subsets: ['latin'],
});

const geistMono = Geist_Mono({
  variable: '--font-geist-mono',
  subsets: ['latin'],
});

export const metadata: Metadata = {
  metadataBase: new URL(process.env.NEXT_PUBLIC_SITE_URL ?? 'http://localhost:3000'),
  title: 'SOL//PULSE — Solana Ecosystem Intelligence',
  description:
    'An automatically updating view of Solana network health, validators, economic activity, and ecosystem signals.',
  openGraph: {
    title: 'SOL//PULSE — Solana Ecosystem Intelligence',
    description:
      'Live network health, validators, liquidity, market signals, and release intelligence for Solana.',
    images: [{ url: '/og.png', width: 1732, height: 909, alt: 'SOL//PULSE — Solana Ecosystem Intelligence' }],
  },
  twitter: {
    card: 'summary_large_image',
    title: 'SOL//PULSE — Solana Ecosystem Intelligence',
    description:
      'Live network health, validators, liquidity, market signals, and release intelligence for Solana.',
    images: ['/og.png'],
  },
};

export default function RootLayout({
  children,
}: Readonly<{
  children: React.ReactNode;
}>) {
  return (
    <html lang="en">
      <body
        className={`${geistSans.variable} ${geistMono.variable} antialiased`}
      >
        {children}
      </body>
    </html>
  );
}
