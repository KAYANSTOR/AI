import { redirect } from 'next/navigation'

/** Compatibility route: activation is now part of the unified onboarding flow. */
export default function LegacyActivationPage() {
  redirect('/onboarding')
}
