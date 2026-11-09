import type { MetadataRoute } from 'next'

const siteUrl =
  process.env.NEXT_PUBLIC_SITE_URL ??
  process.env.NEXT_PUBLIC_APP_URL ??
  'https://kayan-ai.up.railway.app'

const publicRoutes = [
  '/',
  '/features',
  '/how-it-works',
  '/pricing',
  '/services',
  '/about',
] as const

export default function sitemap(): MetadataRoute.Sitemap {
  return publicRoutes.map((route) => ({
    url: new URL(route, siteUrl).toString(),
    changeFrequency: 'monthly',
    priority: route === '/' ? 1 : 0.7,
  }))
}
