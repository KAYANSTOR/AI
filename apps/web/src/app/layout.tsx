import type { Metadata, Viewport } from 'next'
import { IBM_Plex_Mono, IBM_Plex_Sans_Arabic, Inter } from 'next/font/google'
import { siteDescription } from '@/lib/site-metadata'
import './globals.css'

const plexArabic = IBM_Plex_Sans_Arabic({
  variable: '--font-plex-arabic',
  subsets: ['arabic', 'latin'],
  weight: ['400', '500', '600', '700'],
  display: 'swap',
})

const inter = Inter({
  variable: '--font-inter',
  subsets: ['latin'],
  display: 'swap',
})

const plexMono = IBM_Plex_Mono({
  variable: '--font-plex-mono',
  subsets: ['latin'],
  weight: ['400', '500'],
  display: 'swap',
})

/** Absolute base URL for canonical and Open Graph metadata. */
const siteUrl =
  process.env.NEXT_PUBLIC_SITE_URL ?? process.env.NEXT_PUBLIC_APP_URL ?? 'http://localhost:3000'

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
}

export const viewport: Viewport = {
  themeColor: '#0f7a63',
  colorScheme: 'light',
  viewportFit: 'cover',
}

export default function RootLayout({ children }: { children: React.ReactNode }) {
  return (
    <html
      lang="ar"
      dir="rtl"
      className={`${plexArabic.variable} ${inter.variable} ${plexMono.variable} h-full antialiased`}
    >
      <body className="flex min-h-full flex-col bg-background text-text">{children}</body>
    </html>
  )
}
