import { redirect } from 'next/navigation'

/**
 * Compatibility surface only.
 *
 * `/dashboard/setup` used to be a second setup system with its own pages. Setup now lives
 * entirely in the FastPath at /onboarding (docs/PLAN.md §8.3.4), so this route exists so
 * old links — bookmarks, emails, signup redirects written before the change — still land
 * the customer in the right place instead of a 404 or a competing wizard.
 */
export default function SetupCompatibilityPage() {
  redirect('/onboarding')
}
