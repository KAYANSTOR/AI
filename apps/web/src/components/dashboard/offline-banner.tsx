'use client'

import { useSyncExternalStore } from 'react'
import { WifiOff } from 'lucide-react'

function subscribe(callback: () => void) {
  window.addEventListener('online', callback)
  window.addEventListener('offline', callback)
  return () => {
    window.removeEventListener('online', callback)
    window.removeEventListener('offline', callback)
  }
}

function getSnapshot() {
  return typeof navigator !== 'undefined' ? !navigator.onLine : false
}

function getServerSnapshot() {
  return false
}

export function OfflineBanner() {
  const isOffline = useSyncExternalStore(subscribe, getSnapshot, getServerSnapshot)

  if (!isOffline) return null

  return (
    <div
      role="status"
      className="fixed top-0 inset-x-0 z-50 flex items-center justify-center gap-2 bg-warning px-4 py-2.5 text-xs font-bold text-dark shadow-md"
    >
      <WifiOff className="h-4 w-4 shrink-0" aria-hidden="true" />
      <span>أنت غير متصل بالإنترنت — قد تتعذر بعض الإجراءات. تحقّق من اتصالك ثم أعد المحاولة.</span>
    </div>
  )
}
