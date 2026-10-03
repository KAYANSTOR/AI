'use client'

import { createContext, useCallback, useContext, useEffect, useRef, useState } from 'react'
import { Header } from '@/components/Header'
import { ar } from '@/lib/i18n/ar'

type DashboardShellContextValue = {
  open: boolean
  close: () => void
  toggle: () => void
  triggerRef: React.RefObject<HTMLButtonElement | null>
}

const DashboardShellContext = createContext<DashboardShellContextValue | null>(null)

export function useDashboardShell() {
  const context = useContext(DashboardShellContext)
  if (!context) throw new Error('Dashboard shell controls must be used inside DashboardShell.')
  return context
}

export function DashboardShell({
  children,
  sidebar,
  setupBanner,
}: {
  children: React.ReactNode
  sidebar: React.ReactNode
  setupBanner?: React.ReactNode
}) {
  const [open, setOpen] = useState(false)
  const triggerRef = useRef<HTMLButtonElement>(null)
  const wasOpenRef = useRef(false)
  const close = useCallback(() => {
    setOpen(false)
  }, [])
  const toggle = useCallback(() => setOpen((value) => !value), [])

  useEffect(() => {
    if (!open && wasOpenRef.current) triggerRef.current?.focus()
    wasOpenRef.current = open
  }, [open])

  return (
    <DashboardShellContext.Provider value={{ open, close, toggle, triggerRef }}>
      <div className="flex h-dvh min-w-0 overflow-hidden bg-background font-sans">
        {open && (
          <button
            type="button"
            className="fixed inset-0 z-40 bg-dark/50 lg:hidden"
            onClick={close}
            aria-label={ar.header.closeMenu}
          />
        )}
        {sidebar}
        <div className="flex min-w-0 flex-1 flex-col overflow-hidden">
          <Header />
          <main className="min-w-0 flex-1 overflow-y-auto p-4 sm:p-6">
            <div className="mx-auto max-w-6xl space-y-4 animate-page-enter">
              {setupBanner}
              {children}
            </div>
          </main>
        </div>
      </div>
    </DashboardShellContext.Provider>
  )
}
