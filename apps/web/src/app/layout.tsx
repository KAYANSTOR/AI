import type { Metadata, Viewport } from 'next'
import { Geist, Geist_Mono, IBM_Plex_Sans_Arabic } from 'next/font/google'
import { siteDescription } from '@/lib/site-metadata'
import './globals.css'

const plexArabic = IBM_Plex_Sans_Arabic({
  variable: '--font-plex-arabic',
  subsets: ['arabic', 'latin'],
  weight: ['400', '500', '600', '700'],
  display: 'swap',
})

const geistSans = Geist({
  variable: '--font-geist-sans',
  subsets: ['latin'],
})

const geistMono = Geist_Mono({
  variable: '--font-geist-mono',
  subsets: ['latin'],
})

/**
 * Absolute base URL for canonical / Open Graph metadata.
 * Set NEXT_PUBLIC_SITE_URL in production; localhost is the dev default.
 */
const siteUrl = process.env.NEXT_PUBLIC_SITE_URL ?? 'http://localhost:3000'

const title = 'FrontDesk AI — موظّف استقبال بالذكاء الاصطناعي لشركتك'
export const metadata: Metadata = {
  metadataBase: new URL(siteUrl),
  title: {
    default: title,
    template: '%s · FrontDesk AI',
  },
  description: siteDescription,
  applicationName: 'FrontDesk AI',
  appleWebApp: { capable: true, title: 'FrontDesk', statusBarStyle: 'default' },
  formatDetection: { telephone: false },
  keywords: [
    'موظف استقبال ذكاء اصطناعي',
    'أتمتة استقبال العملاء',
    'إدارة العملاء المحتملين',
    'حجز المواعيد',
    'واتساب للأعمال',
    'AI receptionist',
  ],
  authors: [{ name: 'FrontDesk AI' }],
  alternates: { canonical: '/' },
  openGraph: {
    type: 'website',
    locale: 'ar_SA',
    siteName: 'FrontDesk AI',
    title,
    description: siteDescription,
    url: '/',
  },
  twitter: {
    card: 'summary',
    title,
    description: siteDescription,
  },
  robots: { index: true, follow: true },
  // Brand mark icon is provided by src/app/icon.svg (Next.js file convention).
}

export const viewport: Viewport = {
  // Primary brand token value — metadata requires a literal color.
  themeColor: '#D97757',
  colorScheme: 'light',
  viewportFit: 'cover',
}

export default function RootLayout({ children }: { children: React.ReactNode }) {
  return (
    <html
      lang="ar"
      dir="rtl"
      className={`${plexArabic.variable} ${geistSans.variable} ${geistMono.variable} h-full antialiased`}
    >
      <body className="flex min-h-full flex-col bg-background text-text">{children}</body>
    </html>
  )
}
