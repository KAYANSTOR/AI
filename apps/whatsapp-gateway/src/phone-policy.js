/**
 * Gateway-side ignored-phone filter (F-003 consistency layer).
 *
 * The authoritative check runs inside the app (apps/web, phone-policy.ts)
 * before any business record is created. This pre-filter only avoids
 * forwarding messages from numbers the operator listed, so the gateway log
 * stays quiet and the app never receives the event at all.
 */

/** Digits-only comparison key so JID formatting differences never leak past. */
function phoneDigits(value) {
  return String(value ?? '').replace(/\D/g, '')
}

/**
 * @param {Set<string>} ignored digit-normalized ignored numbers
 * @param {string | null} phone raw phone digits from the WhatsApp JID
 * @returns {boolean}
 */
function isIgnoredPhone(ignored, phone) {
  const digits = phoneDigits(phone)
  if (!digits) return false
  return ignored.has(digits)
}

/** Normalize a list of raw numbers into a digit-only Set for isIgnoredPhone. */
function ignoredPhoneNumbers(list) {
  const set = new Set()
  for (const entry of Array.isArray(list) ? list : []) {
    const digits = phoneDigits(entry)
    if (digits) set.add(digits)
  }
  return set
}

module.exports = { isIgnoredPhone, ignoredPhoneNumbers, phoneDigits }
