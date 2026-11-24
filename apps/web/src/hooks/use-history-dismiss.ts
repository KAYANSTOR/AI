'use client'

import { useEffect, useId, useRef } from 'react'

/**
 * Links an overlay (sheet, modal, drawer, popover) to browser history so the
 * hardware/browser Back button closes the top-most overlay first instead of
 * leaving the page.
 *
 * - Opening pushes a same-URL history entry tagged with the overlay id. The
 *   existing Next.js history state is copied so the App Router keeps working.
 * - Back (popstate) closes every overlay whose id is no longer in the stack.
 * - Closing from the UI (X, backdrop, Esc) pops our own entry, but only while
 *   it is still the current one — a navigation started from inside the overlay
 *   is never undone. Links inside an overlay should call `dismissForNavigation`
 *   so closing does not race with the App Router push.
 */
const STACK_KEY = '__kayanOverlays'

type OverlayHistoryState = Record<string, unknown> & { [STACK_KEY]?: string[] }

function currentStack(state: unknown): string[] {
  const stack = (state as OverlayHistoryState | null)?.[STACK_KEY]
  return Array.isArray(stack) ? stack.filter((value): value is string => typeof value === 'string') : []
}

export function useHistoryDismiss(open: boolean, onClose: () => void) {
  const id = useId()
  const onCloseRef = useRef(onClose)
  const navigatingRef = useRef(false)
  useEffect(() => {
    onCloseRef.current = onClose
  }, [onClose])

  useEffect(() => {
    if (!open || typeof window === 'undefined') return
    navigatingRef.current = false
    const baseState = (window.history.state ?? {}) as OverlayHistoryState
    const stack = currentStack(baseState)
    if (!stack.includes(id)) {
      window.history.pushState({ ...baseState, [STACK_KEY]: [...stack, id] }, '', window.location.href)
    }
    let closedByHistory = false
    const href = window.location.href

    const onPopState = (event: PopStateEvent) => {
      if (currentStack(event.state).includes(id)) return
      closedByHistory = true
      onCloseRef.current()
    }
    window.addEventListener('popstate', onPopState)

    return () => {
      window.removeEventListener('popstate', onPopState)
      if (closedByHistory) return
      if (navigatingRef.current) {
        // Drop our marker so this entry behaves like the plain page entry.
        const state = (window.history.state ?? {}) as OverlayHistoryState
        const remaining = currentStack(state).filter((value) => value !== id)
        if (window.location.href === href) window.history.replaceState({ ...state, [STACK_KEY]: remaining }, '', href)
        return
      }
      // Deferred so a router navigation committed in the same tick wins; pop our
      // entry only if it is still on top and we did not navigate away.
      window.setTimeout(() => {
        const nowStack = currentStack(window.history.state)
        if (nowStack[nowStack.length - 1] === id && window.location.href === href) {
          window.history.back()
        }
      }, 0)
    }
  }, [open, id])

  return {
    /** Close because a link/router navigation is starting from inside the overlay. */
    dismissForNavigation() {
      navigatingRef.current = true
      onCloseRef.current()
    },
  }
}
