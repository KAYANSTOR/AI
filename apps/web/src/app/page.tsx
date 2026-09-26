import Link from 'next/link'
import { Bot } from 'lucide-react'

export default function Home() {
  return (
    <div className="min-h-screen bg-slate-950 text-white flex flex-col">
      <header className="border-b border-slate-800">
        <div className="max-w-5xl mx-auto px-6 h-16 flex items-center justify-between">
          <div className="flex items-center gap-2 font-bold text-lg">
            <div className="bg-indigo-500 w-8 h-8 rounded-lg flex items-center justify-center">
              <Bot size={18} />
            </div>
            FrontDesk AI
          </div>
          <div className="flex items-center gap-3">
            <Link href="/login" className="text-sm text-slate-300 hover:text-white transition-colors">Sign in</Link>
            <Link href="/signup" className="text-sm bg-indigo-600 hover:bg-indigo-500 px-4 py-2 rounded-lg font-medium transition-colors">Start free</Link>
          </div>
        </div>
      </header>
      <main className="flex-1 flex flex-col items-center justify-center px-6 py-20 text-center">
        <p className="text-indigo-400 text-sm font-medium tracking-wide uppercase mb-4">Beauty · Health · Wellness</p>
        <h1 className="text-4xl sm:text-5xl font-extrabold tracking-tight max-w-2xl leading-tight">
          We don&apos;t just answer.<br />
          <span className="text-indigo-400">We book &amp; recover revenue</span><br />
          while you sleep.
        </h1>
        <p className="mt-6 text-slate-400 max-w-xl text-lg">
          One AI receptionist on Phone, WhatsApp, and Instagram — unified CRM, follow-ups, and lost-lead recovery for clinics and premium salons.
        </p>
        <div className="mt-10 flex flex-wrap gap-4 justify-center">
          <Link href="/signup" className="bg-indigo-600 hover:bg-indigo-500 text-white px-6 py-3 rounded-xl font-semibold transition-colors">Create account</Link>
          <Link href="/login" className="border border-slate-700 hover:border-slate-500 text-slate-200 px-6 py-3 rounded-xl font-semibold transition-colors">Sign in</Link>
        </div>
      </main>
    </div>
  )
}
