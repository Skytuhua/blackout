/** Explain only the recorded reason; do not infer why a provider failed. */
export function fallbackCopy(reason: string): string {
  if (['call_timeout', 'interaction_timeout', 'canceled_or_expired', 'deadline'].includes(reason)) return 'The reply took too long. Suggested orders still work.';
  if (['budget_exhausted', 'mission_quota'].includes(reason)) return 'The assistant allowance is used up. Suggested orders still work.';
  if (reason === 'provider_quota') return 'The assistant’s usage limit was reached. Suggested orders still work.';
  if (['provider_busy', 'interaction_busy'].includes(reason)) return 'I’m busy with another reply. Try again shortly.';
  if (reason === 'scripted') return 'The assistant is offline. Suggested orders still work.';
  if (reason === 'missing_key') return 'The assistant isn’t connected. Suggested orders still work.';
  if (reason === 'incomplete_response') return 'The reply was cut short. Suggested orders still work.';
  if (['invalid_evidence', 'invalid_action', 'invalid_target', 'unsafe_narrative'].includes(reason)) return 'I couldn’t verify that reply. Suggested orders still work.';
  return 'I couldn’t return a valid reply. Suggested orders still work.';
}
