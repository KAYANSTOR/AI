'use client'

import { useEffect, type RefObject } from 'react'

const FOCUSABLE = 'a[href],button:not([disabled]),input:not([disabled]):not([type="hidden"]),select:not([disabled]),textarea:not([disabled]),[tabindex]:not([tabindex="-1"])'

/** Focus trap + Escape to close + focus restore for custom (non-<dialog>) modals. */
export function useModalFocus(open: boolean, containerRef: RefObject<HTMLElement | null>, onClose: () => void) {
  useEffect(() => {
    if (!open) return
    const returnTo = document.activeElement instanceof HTMLElement ? document.activeElement : null
    const container = containerRef.current
    const items = () => Array.from(container?.querySelectorAll<HTMLElement>(FOCUSABLE) ?? []).filter((item) => item.getClientRects().length > 0)
    const frame = requestAnimationFrame(() => {
      if (container && !container.contains(document.activeElement)) (items()[0] ?? container).focus()
    })
    function onKeyDown(event: KeyboardEvent) {
      if (event.key === 'Escape') { event.preventDefault(); onClose(); return }
      if (event.key !== 'Tab') return
      const list = items()
      const first = list[0]
      const last = list[list.length - 1]
      if (!first || !last) return
      if (event.shiftKey && document.activeElement === first) { event.preventDefault(); last.focus() }
      else if (!event.shiftKey && document.activeElement === last) { event.preventDefault(); first.focus() }
    }
    document.addEventListener('keydown', onKeyDown)
    return () => {
      cancelAnimationFrame(frame)
      document.removeEventListener('keydown', onKeyDown)
      if (returnTo?.isConnected) returnTo.focus()
    }
  }, [open, containerRef, onClose])
}
