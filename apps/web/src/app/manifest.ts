import type { MetadataRoute } from 'next'
import { siteDescription } from '@/lib/site-metadata'
import { brandColors } from '@/lib/design-system/tokens'

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
    theme_color: brandColors.primary,
    background_color: brandColors.primary,
    icons: [
      {
        src: '/icon.svg',
        sizes: 'any',
        type: 'image/svg+xml',
        purpose: 'any maskable',
      },
    ],
  }
}
