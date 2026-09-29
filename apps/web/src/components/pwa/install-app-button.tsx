'use client'

import { useEffect, useState, useSyncExternalStore } from 'react'
import { Download, X } from 'lucide-react'
import { ar } from '@/lib/i18n/ar'

interface BeforeInstallPromptEvent extends Event {
  prompt(): Promise<void>
  userChoice: Promise<{ outcome: 'accepted' | 'dismissed'; platform: string }>
}

function isIosSafari() {
  const userAgent = navigator.userAgent
  const iosDevice = /iPhone|iPad|iPod/i.test(userAgent) ||
    (navigator.platform === 'MacIntel' && navigator.maxTouchPoints > 1)
  const otherIosBrowser = /CriOS|FxiOS|EdgiOS|OPiOS|DuckDuckGo/i.test(userAgent)
  return iosDevice && !otherIosBrowser && /Safari/i.test(userAgent)
}

function subscribeToHydration() {
  return () => {}
}

function getHydrationSnapshot() {
  return true
}

function getServerHydrationSnapshot() {
  return false
}

function subscribeToStandalone(onChange: () => void) {
  const mediaQuery = window.matchMedia('(display-mode: standalone)')
  mediaQuery.addEventListener('change', onChange)
  window.addEventListener('appinstalled', onChange)
  return () => {
    mediaQuery.removeEventListener('change', onChange)
    window.removeEventListener('appinstalled', onChange)
  }
}

function getStandaloneSnapshot() {
  return (
    window.matchMedia('(display-mode: standalone)').matches ||
    Boolean((navigator as Navigator & { standalone?: boolean }).standalone)
  )
}

function getServerStandaloneSnapshot() {
  return false
}

export function InstallAppButton({ compact = false }: { compact?: boolean }) {
  const mounted = useSyncExternalStore(
    subscribeToHydration,
    getHydrationSnapshot,
    getServerHydrationSnapshot
  )
  const standalone = useSyncExternalStore(
    subscribeToStandalone,
    getStandaloneSnapshot,
    getServerStandaloneSnapshot
  )
  const [installPrompt, setInstallPrompt] = useState<BeforeInstallPromptEvent | null>(null)
  const [helpOpen, setHelpOpen] = useState(false)
  const iosSafari = mounted && isIosSafari()

  useEffect(() => {
    function handleBeforeInstall(event: Event) {
      event.preventDefault()
      setInstallPrompt(event as BeforeInstallPromptEvent)
    }
    function handleInstalled() {
      setInstallPrompt(null)
      setHelpOpen(false)
    }
    window.addEventListener('beforeinstallprompt', handleBeforeInstall)
    window.addEventListener('appinstalled', handleInstalled)
    return () => {
      window.removeEventListener('beforeinstallprompt', handleBeforeInstall)
      window.removeEventListener('appinstalled', handleInstalled)
    }
  }, [])

  useEffect(() => {
    if (!helpOpen) return
    function handleKeyDown(event: KeyboardEvent) {
      if (event.key === 'Escape') setHelpOpen(false)
    }
    document.addEventListener('keydown', handleKeyDown)
    return () => document.removeEventListener('keydown', handleKeyDown)
  }, [helpOpen])

  if (!mounted || standalone || (!installPrompt && !iosSafari)) return null

  async function install() {
    if (iosSafari) {
      setHelpOpen((value) => !value)
      return
    }
    if (!installPrompt) return
    await installPrompt.prompt()
    const choice = await installPrompt.userChoice
    if (choice.outcome === 'accepted') setInstallPrompt(null)
  }

  return (
    <div className="relative">
      <button
        type="button"
        onClick={install}
        aria-label={ar.install.button}
        aria-expanded={iosSafari ? helpOpen : undefined}
        aria-controls={iosSafari ? 'ios-install-help' : undefined}
        className="inline-flex min-h-11 min-w-11 items-center justify-center gap-2 rounded-lg border border-border px-3 py-2 text-base font-medium text-text transition-colors hover:border-primary-dark hover:text-primary-dark md:text-sm"
      >
        <Download size={17} aria-hidden="true" />
        <span className={compact ? 'hidden lg:inline' : undefined}>{ar.install.button}</span>
      </button>
      {iosSafari && helpOpen && (
        <div
          id="ios-install-help"
          role="dialog"
          aria-label={ar.install.button}
          className="absolute end-0 top-full z-50 mt-2 w-72 max-w-[calc(100vw-2rem)] rounded-xl border border-border bg-surface p-4 text-sm leading-6 text-text shadow-lg"
        >
          <button
            type="button"
            onClick={() => setHelpOpen(false)}
            className="float-end inline-flex h-11 w-11 items-center justify-center rounded-lg text-text-muted hover:bg-background"
            aria-label={ar.install.dismiss}
          >
            <X size={16} aria-hidden="true" />
          </button>
          <p>{ar.install.instructions}</p>
        </div>
      )}
    </div>
  )
}
