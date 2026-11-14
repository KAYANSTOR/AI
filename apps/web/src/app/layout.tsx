import type { Metadata, Viewport } from 'next'
import { Cairo, IBM_Plex_Mono } from 'next/font/google'
import { siteDescription } from '@/lib/site-metadata'
import { themeBootScript } from '@/components/theme/theme-script'
import './globals.css'

const cairo = Cairo({
  variable: '--font-cairo',
  subsets: ['arabic', 'latin'],
  weight: ['400', '500', '600', '700'],
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

const title = 'KAYAN AI — موظّف استقبال بالذكاء الاصطناعي لشركتك'
export const metadata: Metadata = {
  metadataBase: new URL(siteUrl),
  title: {
    default: title,
    template: '%s · KAYAN AI',
  },
  description: siteDescription,
  applicationName: 'KAYAN AI',
  appleWebApp: { capable: true, title: 'KAYAN AI', statusBarStyle: 'default' },
  formatDetection: { telephone: false },
  keywords: [
    'موظف استقبال ذكاء اصطناعي',
    'أتمتة استقبال العملاء',
    'إدارة العملاء المحتملين',
    'حجز المواعيد',
    'واتساب للأعمال',
    'AI receptionist',
  ],
  authors: [{ name: 'KAYAN AI' }],
  openGraph: {
    type: 'website',
    locale: 'ar_SA',
    siteName: 'KAYAN AI',
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
  themeColor: '#f4efe5',
  colorScheme: 'light dark',
  viewportFit: 'cover',
}

export default function RootLayout({ children }: { children: React.ReactNode }) {
  return (
    <html
      lang="ar"
      dir="rtl"
      suppressHydrationWarning
      className={`${cairo.variable} ${plexMono.variable} h-full antialiased`}
    >
      <head>
        {/* Applies the saved or system theme before first paint. */}
        <script dangerouslySetInnerHTML={{ __html: themeBootScript }} />
      </head>
      <body className="flex min-h-full flex-col bg-background text-text">{children}</body>
    </html>
  )
}
