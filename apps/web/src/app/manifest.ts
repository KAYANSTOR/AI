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
    theme_color: '#3e5a3f',
    background_color: '#f4efe5',
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
