'use client'

import { Moon, Sun } from 'lucide-react'
import { useSyncExternalStore } from 'react'
import { THEME_STORAGE_KEY, type ThemePreference } from './theme-script'

function applyTheme(theme: ThemePreference) {
  const root = document.documentElement
  root.classList.toggle('dark', theme === 'dark')
  root.classList.toggle('light', theme === 'light')
}

/** The <html> class is the single source of truth; observe it so every toggle stays in sync. */
function subscribe(onChange: () => void) {
  const observer = new MutationObserver(onChange)
  observer.observe(document.documentElement, { attributes: true, attributeFilter: ['class'] })
  return () => observer.disconnect()
}

const readTheme = (): ThemePreference =>
  document.documentElement.classList.contains('dark') ? 'dark' : 'light'
const readServerTheme = (): ThemePreference | null => null

/** Switches between light and dark; the choice is remembered on this device. */
export function ThemeToggle({ className = '' }: { className?: string }) {
  const theme = useSyncExternalStore<ThemePreference | null>(subscribe, readTheme, readServerTheme)

  const isDark = theme === 'dark'
  const label = isDark ? 'التبديل إلى الوضع الفاتح' : 'التبديل إلى الوضع الداكن'

  return (
    <button
      type="button"
      onClick={() => {
        const next: ThemePreference = isDark ? 'light' : 'dark'
        applyTheme(next)
        try {
          localStorage.setItem(THEME_STORAGE_KEY, next)
        } catch {
          // Storage can be unavailable (private mode); the theme still applies for this visit.
        }
      }}
      aria-label={label}
      title={label}
      className={`inline-flex h-10 w-10 shrink-0 items-center justify-center rounded-xl border border-border bg-surface text-text-muted transition-colors hover:border-border-strong hover:text-text ${className}`}
    >
      {/* Before hydration the icon is hidden so server and client markup match. */}
      {theme === null ? (
        <Sun size={18} aria-hidden="true" className="opacity-0" />
      ) : isDark ? (
        <Sun size={18} aria-hidden="true" />
      ) : (
        <Moon size={18} aria-hidden="true" />
      )}
    </button>
  )
}
