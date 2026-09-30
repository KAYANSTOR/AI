/** States the activation wizard is allowed to write (mirrors the 0020 check constraint). */
export type ActivationState =
  | 'account_created'
  | 'email_pending'
  | 'workspace_ready'
  | 'configuring'
  | 'ready_for_test'
  | 'ready_to_activate'
  | 'active'

/**
 * The activation state a wizard step may move a tenant to.
 *
 * `active` is never reachable from here, even though the column allows it: only
 * activateGoLive() may activate a tenant, and it re-evaluates the production readiness checks
 * first. Deriving the state on the server — instead of accepting it from the caller — is what
 * keeps that gate meaningful.
 */
export function activationStateForStep(input: {
  step: number
  storedState: string
  smokeStatus?: string | null
}): ActivationState {
  // An activated tenant stays activated; stepping back through the wizard must not undo it.
  if (input.storedState === 'active') return 'active'

  if (input.step >= 10) {
    return input.smokeStatus === 'passed' ? 'ready_to_activate' : 'ready_for_test'
  }

  return 'configuring'
}
