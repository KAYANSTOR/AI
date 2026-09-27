import { Bell, Search } from 'lucide-react'

export function Header() {
  return (
    <header className="sticky top-0 z-10 flex h-16 items-center justify-between border-b border-border bg-surface px-6">
      <div className="flex flex-1 items-center gap-4">
        <div className="relative w-64">
          <Search
            size={16}
            aria-hidden="true"
            className="absolute start-2.5 top-2.5 text-text-muted"
          />
          <input
            type="text"
            placeholder="Search leads, chats..."
            aria-label="Search leads, chats"
            className="w-full rounded-lg border border-border bg-background py-2 pe-4 ps-9 text-sm transition-all focus:border-primary-dark focus:outline-none focus:ring-2 focus:ring-primary/20"
          />
        </div>
      </div>

      <div className="flex items-center gap-4">
        <button
          type="button"
          aria-label="Notifications"
          className="relative rounded-full p-2 text-text-muted transition-colors hover:bg-background hover:text-text"
        >
          <Bell size={20} aria-hidden="true" />
          <span className="absolute end-1.5 top-1.5 h-2 w-2 rounded-full bg-error ring-2 ring-surface" />
        </button>
      </div>
    </header>
  )
}
