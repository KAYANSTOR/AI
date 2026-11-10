'use client'

import { useCallback, useEffect, useId, useRef, useState } from 'react'
import { useRouter } from 'next/navigation'
import { Loader2, Search, User, MessageSquare } from 'lucide-react'
import type { GlobalSearchResult } from '@/app/api/search/route'
import { ar } from '@/lib/i18n/ar'

export function GlobalSearch({
  autoFocus = false,
  onNavigate,
}: {
  autoFocus?: boolean
  onNavigate?: () => void
}) {
  const router = useRouter()
  const [query, setQuery] = useState('')
  const [results, setResults] = useState<GlobalSearchResult[]>([])
  const [loading, setLoading] = useState(false)
  const [open, setOpen] = useState(false)
  const [failed, setFailed] = useState(false)
  const [activeIndex, setActiveIndex] = useState(-1)

  const containerRef = useRef<HTMLDivElement>(null)
  const abortRef = useRef<AbortController | null>(null)
  const listId = useId()

  function handleQueryChange(value: string) {
    setQuery(value)
    setFailed(false)

    if (value.trim().length < 2) {
      abortRef.current?.abort()
      setResults([])
      setLoading(false)
      setOpen(false)
      return
    }

    setLoading(true)
  }

  // The effect only schedules the debounced request; clearing state happens in the
  // change handler so no state is written synchronously during render/effects.
  useEffect(() => {
    const term = query.trim()
    if (term.length < 2) return

    const timer = setTimeout(async () => {
      abortRef.current?.abort()
      const controller = new AbortController()
      abortRef.current = controller
      try {
        const res = await fetch(`/api/search?q=${encodeURIComponent(term)}`, {
          signal: controller.signal,
        })
        if (!res.ok) throw new Error('search_failed')
        const payload = (await res.json()) as { results?: GlobalSearchResult[] }
        setResults(payload.results ?? [])
        setActiveIndex(-1)
        setOpen(true)
        setFailed(false)
      } catch (error) {
        if ((error as Error).name === 'AbortError') return
        setResults([])
        setOpen(true)
        setFailed(true)
      } finally {
        setLoading(false)
      }
    }, 250)

    return () => clearTimeout(timer)
  }, [query])

  useEffect(() => {
    function handlePointerDown(event: MouseEvent) {
      if (!containerRef.current?.contains(event.target as Node)) setOpen(false)
    }
    document.addEventListener('mousedown', handlePointerDown)
    return () => document.removeEventListener('mousedown', handlePointerDown)
  }, [])

  const goTo = useCallback(
    (result: GlobalSearchResult) => {
      setOpen(false)
      setQuery('')
      onNavigate?.()
      router.push(result.href)
    },
    [onNavigate, router]
  )

  function handleKeyDown(event: React.KeyboardEvent<HTMLInputElement>) {
    if (event.key === 'Escape') {
      setOpen(false)
      onNavigate?.()
      return
    }
    if (!open || results.length === 0) return
    if (event.key === 'ArrowDown') {
      event.preventDefault()
      setActiveIndex((index) => (index + 1) % results.length)
    } else if (event.key === 'ArrowUp') {
      event.preventDefault()
      setActiveIndex((index) => (index <= 0 ? results.length - 1 : index - 1))
    } else if (event.key === 'Enter') {
      const result = results[activeIndex]
      if (result) {
        event.preventDefault()
        goTo(result)
      }
    }
  }

  return (
    <div ref={containerRef} className="relative w-full">
      <Search
        size={16}
        aria-hidden="true"
        className="pointer-events-none absolute start-3 top-1/2 -translate-y-1/2 text-text-muted"
      />
      <input
        type="search"
        value={query}
        autoFocus={autoFocus}
        onChange={(event) => handleQueryChange(event.target.value)}
        onFocus={() => {
          if (query.trim().length >= 2) setOpen(true)
        }}
        onKeyDown={handleKeyDown}
        placeholder={ar.header.searchPlaceholder}
        aria-label={ar.header.searchPlaceholder}
        aria-expanded={open}
        aria-controls={listId}
        role="combobox"
        aria-autocomplete="list"
        className="min-h-11 w-full rounded-lg border border-border bg-background py-2 pe-9 ps-9 text-base transition-colors focus:border-primary-dark focus:outline-none focus:ring-2 focus:ring-primary/20 md:text-sm"
      />
      {loading && (
        <Loader2
          size={15}
          aria-hidden="true"
          className="absolute end-3 top-1/2 -translate-y-1/2 animate-spin text-text-muted"
        />
      )}

      {open && (
        <div
          id={listId}
          role="listbox"
          className="absolute inset-x-0 top-[calc(100%+0.375rem)] z-50 max-h-80 overflow-y-auto rounded-xl border border-border bg-surface p-1.5 shadow-lg animate-fade-in scrollbar-thin"
        >
          {failed ? (
            <p className="px-3 py-4 text-center text-xs text-error">
              تعذّر تنفيذ البحث. حاول مرة أخرى.
            </p>
          ) : results.length === 0 ? (
            <p className="px-3 py-4 text-center text-xs text-text-muted">
              {loading ? 'جارٍ البحث…' : 'لا توجد نتائج مطابقة.'}
            </p>
          ) : (
            results.map((result, index) => (
              <button
                key={result.id}
                type="button"
                role="option"
                aria-selected={index === activeIndex}
                onClick={() => goTo(result)}
                onMouseEnter={() => setActiveIndex(index)}
                className={`flex w-full items-center gap-2.5 rounded-lg px-3 py-2 text-start transition-colors ${
                  index === activeIndex ? 'bg-primary-light/25' : 'hover:bg-background'
                }`}
              >
                <span className="flex h-8 w-8 shrink-0 items-center justify-center rounded-lg bg-background text-text-muted">
                  {result.type === 'conversation' ? (
                    <MessageSquare size={15} aria-hidden="true" />
                  ) : (
                    <User size={15} aria-hidden="true" />
                  )}
                </span>
                <span className="min-w-0 flex-1">
                  <span className="block truncate text-sm font-semibold text-text">
                    {result.title}
                  </span>
                  {result.subtitle && (
                    <span className="block truncate text-xs text-text-muted" dir="auto">
                      {result.subtitle}
                    </span>
                  )}
                </span>
                <span className="shrink-0 text-[10px] font-medium text-text-muted">
                  {result.type === 'conversation' ? 'محادثة' : 'جهة اتصال'}
                </span>
              </button>
            ))
          )}
        </div>
      )}
    </div>
  )
}
