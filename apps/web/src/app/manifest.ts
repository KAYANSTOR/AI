import type { MetadataRoute } from 'next'
import { siteDescription } from '@/lib/site-metadata'

export default function manifest(): MetadataRoute.Manifest {
  return {
    name: 'KAYAN AI',
    short_name: 'KAYAN AI',
    description: siteDescription,
    id: '/dashboard',
    start_url: '/dashboard',
    scope: '/',
    display: 'standalone',
    lang: 'ar',
    dir: 'rtl',
    theme_color: '#d97757',
    background_color: '#f7f4ef',
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
