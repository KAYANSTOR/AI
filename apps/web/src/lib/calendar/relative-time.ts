import { westernDigits } from '@/lib/phone/arab-countries'

/**
 * Resolves the date/time a customer wrote in Arabic ("اليوم"، "غداً"، "3 عصراً")
 * or a naive ISO string into an ISO-8601 timestamp in the organization timezone.
 * Returns null when no explicit time is present so the agent asks instead of guessing.
 */

const WEEKDAYS: Array<[RegExp, number]> = [
  [/الأحد|الاحد/, 0], [/الاثنين|الإثنين|الأثنين/, 1], [/الثلاثاء|الثلوث/, 2], [/الأربعاء|الاربعاء|الربوع/, 3],
  [/الخميس/, 4], [/الجمعة|الجمعه/, 5], [/السبت/, 6],
]
const WEEKDAY_AR = ['الأحد', 'الاثنين', 'الثلاثاء', 'الأربعاء', 'الخميس', 'الجمعة', 'السبت']

function wallParts(timezone: string, at: Date) {
  const parts = new Intl.DateTimeFormat('en-US', {
    timeZone: timezone, hourCycle: 'h23', year: 'numeric', month: '2-digit', day: '2-digit', hour: '2-digit', minute: '2-digit', second: '2-digit', weekday: 'short',
  }).formatToParts(at)
  const get = (type: string) => parts.find((part) => part.type === type)?.value ?? ''
  const weekday = ['Sun', 'Mon', 'Tue', 'Wed', 'Thu', 'Fri', 'Sat'].indexOf(get('weekday'))
  return { year: Number(get('year')), month: Number(get('month')), day: Number(get('day')), hour: Number(get('hour')) % 24, minute: Number(get('minute')), weekday }
}

function safeZone(timezone: string | null | undefined) {
  const zone = String(timezone || 'Asia/Aden')
  try { new Intl.DateTimeFormat('en-US', { timeZone: zone }); return zone } catch { return 'Asia/Aden' }
}

function offsetMinutes(timezone: string, at: Date) {
  const wall = wallParts(timezone, at)
  const asUtc = Date.UTC(wall.year, wall.month - 1, wall.day, wall.hour, wall.minute)
  return Math.round((asUtc - Math.floor(at.getTime() / 60000) * 60000) / 60000)
}

function formatOffset(minutes: number) {
  const sign = minutes >= 0 ? '+' : '-'
  const abs = Math.abs(minutes)
  return `${sign}${String(Math.floor(abs / 60)).padStart(2, '0')}:${String(abs % 60).padStart(2, '0')}`
}

const pad = (value: number) => String(value).padStart(2, '0')

function ymd(date: { year: number; month: number; day: number }) {
  return `${date.year}-${pad(date.month)}-${pad(date.day)}`
}

function addDays(date: { year: number; month: number; day: number }, days: number) {
  const next = new Date(Date.UTC(date.year, date.month - 1, date.day + days))
  return { year: next.getUTCFullYear(), month: next.getUTCMonth() + 1, day: next.getUTCDate() }
}

function localIso(timezone: string, date: { year: number; month: number; day: number }, hour: number, minute: number) {
  const guess = new Date(Date.UTC(date.year, date.month - 1, date.day, hour, minute))
  const offset = offsetMinutes(timezone, new Date(guess.getTime() - offsetMinutes(timezone, guess) * 60000))
  return `${ymd(date)}T${pad(hour)}:${pad(minute)}:00${formatOffset(offset)}`
}

export function localNowContext(timezone: string | null | undefined, now: Date = new Date()) {
  const zone = safeZone(timezone)
  const wall = wallParts(zone, now)
  return {
    timezone: zone,
    today: ymd(wall),
    tomorrow: ymd(addDays(wall, 1)),
    time: `${pad(wall.hour)}:${pad(wall.minute)}`,
    weekdayAr: WEEKDAY_AR[wall.weekday] ?? '',
    offset: formatOffset(offsetMinutes(zone, now)),
  }
}

export function resolveArabicDateTime(input: string | null | undefined, options: { timezone?: string | null; now?: Date } = {}): string | null {
  const zone = safeZone(options.timezone)
  const now = options.now ?? new Date()
  const text = westernDigits(String(input ?? '')).trim()
  if (!text) return null

  // Explicit instant (Z or numeric offset): keep it as an absolute time.
  if (/^\d{4}-\d{2}-\d{2}T\d{2}:\d{2}(:\d{2}(\.\d+)?)?(Z|[+-]\d{2}:?\d{2})$/i.test(text)) {
    const parsed = new Date(text)
    return Number.isNaN(parsed.getTime()) ? null : parsed.toISOString()
  }

  const today = wallParts(zone, now)
  let date: { year: number; month: number; day: number } | null = null
  let rest = text
  const iso = rest.match(/(\d{4})-(\d{2})-(\d{2})/)
  if (iso) {
    date = { year: Number(iso[1]), month: Number(iso[2]), day: Number(iso[3]) }
    rest = rest.replace(iso[0], ' ')
  } else {
    const dm = rest.match(/(\d{1,2})\/(\d{1,2})(?:\/(\d{2,4}))?/)
    if (dm) {
      const year = dm[3] ? (dm[3].length === 2 ? 2000 + Number(dm[3]) : Number(dm[3])) : today.year
      date = { year, month: Number(dm[2]), day: Number(dm[1]) }
      rest = rest.replace(dm[0], ' ')
    } else if (/بعد\s*(غد|غدا|غداً|بكر[ةه])/.test(rest)) date = addDays(today, 2)
    else if (/غدا|غداً|غدًا|(^|\s)غد(\s|$)|بكر[ةه]|tomorrow/i.test(rest)) date = addDays(today, 1)
    else if (/اليوم|الليلة|الليله|today|tonight/i.test(rest)) date = today
    else {
      const weekday = WEEKDAYS.find(([pattern]) => pattern.test(rest))
      if (weekday) {
        let delta = (weekday[1] - today.weekday + 7) % 7
        if (delta === 0) delta = 7
        date = addDays(today, delta)
      }
    }
  }

  const time = rest.replace(/T/, ' ').match(/(?:^|[^\d])(\d{1,2})(?:\s*[:٫.]\s*(\d{2}))?(?!\d)/)
  if (!time) return null
  let hour = Number(time[1])
  const minute = time[2] ? Number(time[2]) : (/ونص|و\s*نصف|والنصف/.test(rest) ? 30 : /وربع|والربع/.test(rest) ? 15 : 0)
  if (hour > 23 || minute > 59) return null
  const morning = /صباح|الصبح|الفجر|(^|\s)ص(\s|$)|\bam\b/i.test(rest)
  const noon = /ظهر|الظهر/.test(rest)
  const afternoon = /عصر|العصر|بعد الظهر|مساء|المساء|مساءً|الليل|ليلا|ليلاً|بالليل|المغرب|العشاء|(^|\s)م(\s|$)|\bpm\b/i.test(rest)
  if (afternoon && hour < 12) hour += 12
  else if (noon && hour < 11) hour += 12
  else if (!morning && !afternoon && !noon && !iso && hour >= 1 && hour <= 7) hour += 12
  if (morning && hour === 12) hour = 0
  if (!date) date = today
  return localIso(zone, date, hour, minute)
}

/** Calendar day (YYYY-MM-DD) for "اليوم"، "غداً"، "بعد غد"، a weekday name or an ISO date. */
export function resolveArabicDate(input: string | null | undefined, options: { timezone?: string | null; now?: Date } = {}): string | null {
  const text = westernDigits(String(input ?? '')).trim()
  if (/^\d{4}-\d{2}-\d{2}$/.test(text)) return text
  const resolved = resolveArabicDateTime(`${text} 12:00`, options)
  return resolved ? resolved.slice(0, 10) : null
}
