import type { MetadataRoute } from 'next'
import { siteDescription } from '@/lib/site-metadata'

export default function manifest(): MetadataRoute.Manifest {
  return {
    name: 'FrontDesk AI',
    short_name: 'FrontDesk',
    description: siteDescription,
    id: '/dashboard',
    start_url: '/dashboard',
    scope: '/',
    display: 'standalone',
    lang: 'ar',
    dir: 'rtl',
    theme_color: '#0f7a63',
    background_color: '#f4f6f5',
    icons: [
      { src: '/icons/icon-192.png', sizes: '192x192', type: 'image/png', purpose: 'any' },
      { src: '/icons/icon-512.png', sizes: '512x512', type: 'image/png', purpose: 'any' },
      {
        src: '/icons/icon-maskable-512.png',
        sizes: '512x512',
        type: 'image/png',
        purpose: 'maskable',
      },
    ],
  }
}
