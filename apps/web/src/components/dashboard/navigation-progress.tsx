'use client'

import { useEffect, useState, useTransition } from 'react'
import { usePathname, useSearchParams } from 'next/navigation'

export function NavigationProgress() {
  const pathname = usePathname()
  const searchParams = useSearchParams()
  const [isNavigating, setIsNavigating] = useState(false)
  const [, startTransition] = useTransition()

  // Reset when path or search params change
  useEffect(() => {
    setIsNavigating(false)
  }, [pathname, searchParams])

  // Listen to internal link clicks to give instant 0ms feedback
  useEffect(() => {
    function handleAnchorClick(event: MouseEvent) {
      const target = (event.target as HTMLElement)?.closest('a')
      if (!target) return

      const href = target.getAttribute('href')
      if (!href) return

      // Ignore external links, anchors, or new tab clicks
      if (
        href.startsWith('http') ||
        href.startsWith('#') ||
        href.startsWith('mailto:') ||
        href.startsWith('tel:') ||
        target.target === '_blank' ||
        event.ctrlKey ||
        event.metaKey ||
        event.shiftKey
      ) {
        return
      }

      // Check if it's the exact same url
      const currentUrl = window.location.pathname + window.location.search
      if (href === currentUrl) return

      startTransition(() => {
        setIsNavigating(true)
      })
    }

    document.addEventListener('click', handleAnchorClick, { capture: true })
    return () => {
      document.removeEventListener('click', handleAnchorClick, { capture: true })
    }
  }, [])

  if (!isNavigating) return null

  return (
    <div
      aria-hidden="true"
      className="fixed inset-x-0 top-0 z-[100] h-[2.5px] overflow-hidden bg-transparent pointer-events-none"
    >
      <div className="h-full bg-gradient-to-r from-primary via-primary-dark to-primary-light animate-progress-indeterminate shadow-[0_0_8px_rgba(217,119,87,0.6)]" />
    </div>
  )
}
