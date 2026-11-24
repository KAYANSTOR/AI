export type ArabCountry = { iso: string; nameAr: string; dial: string; flag: string }

/** The 22 Arab League countries, Yemen first (default). */
export const ARAB_COUNTRIES: readonly ArabCountry[] = [
  { iso: 'YE', nameAr: 'اليمن', dial: '967', flag: '🇾🇪' },
  { iso: 'SA', nameAr: 'السعودية', dial: '966', flag: '🇸🇦' },
  { iso: 'AE', nameAr: 'الإمارات', dial: '971', flag: '🇦🇪' },
  { iso: 'EG', nameAr: 'مصر', dial: '20', flag: '🇪🇬' },
  { iso: 'KW', nameAr: 'الكويت', dial: '965', flag: '🇰🇼' },
  { iso: 'QA', nameAr: 'قطر', dial: '974', flag: '🇶🇦' },
  { iso: 'BH', nameAr: 'البحرين', dial: '973', flag: '🇧🇭' },
  { iso: 'OM', nameAr: 'عُمان', dial: '968', flag: '🇴🇲' },
  { iso: 'JO', nameAr: 'الأردن', dial: '962', flag: '🇯🇴' },
  { iso: 'LB', nameAr: 'لبنان', dial: '961', flag: '🇱🇧' },
  { iso: 'IQ', nameAr: 'العراق', dial: '964', flag: '🇮🇶' },
  { iso: 'SY', nameAr: 'سوريا', dial: '963', flag: '🇸🇾' },
  { iso: 'PS', nameAr: 'فلسطين', dial: '970', flag: '🇵🇸' },
  { iso: 'SD', nameAr: 'السودان', dial: '249', flag: '🇸🇩' },
  { iso: 'LY', nameAr: 'ليبيا', dial: '218', flag: '🇱🇾' },
  { iso: 'TN', nameAr: 'تونس', dial: '216', flag: '🇹🇳' },
  { iso: 'DZ', nameAr: 'الجزائر', dial: '213', flag: '🇩🇿' },
  { iso: 'MA', nameAr: 'المغرب', dial: '212', flag: '🇲🇦' },
  { iso: 'MR', nameAr: 'موريتانيا', dial: '222', flag: '🇲🇷' },
  { iso: 'SO', nameAr: 'الصومال', dial: '252', flag: '🇸🇴' },
  { iso: 'DJ', nameAr: 'جيبوتي', dial: '253', flag: '🇩🇯' },
  { iso: 'KM', nameAr: 'جزر القمر', dial: '269', flag: '🇰🇲' },
]

export const DEFAULT_COUNTRY: ArabCountry = ARAB_COUNTRIES[0]

const ARABIC_DIGITS: Record<string, string> = {
  '٠': '0', '١': '1', '٢': '2', '٣': '3', '٤': '4', '٥': '5', '٦': '6', '٧': '7', '٨': '8', '٩': '9',
  '۰': '0', '۱': '1', '۲': '2', '۳': '3', '۴': '4', '۵': '5', '۶': '6', '۷': '7', '۸': '8', '۹': '9',
}

export function westernDigits(value: string): string {
  return value.replace(/[٠-٩۰-۹]/g, (digit) => ARABIC_DIGITS[digit] ?? digit)
}

/**
 * Normalises a number typed with a selected country code to E.164 (`+<dial><national>`).
 * Accepts an already-international number (+ or 00), strips a local trunk zero,
 * and rejects anything that is not 6–14 national digits.
 */
export function toE164(dial: string, input: string): string | null {
  const raw = westernDigits(String(input ?? '')).trim()
  if (!raw || /[^\d\s()+\-.]/.test(raw)) return null
  let digits = raw.replace(/[^\d+]/g, '')
  if (digits.startsWith('+')) digits = digits.slice(1)
  else if (digits.startsWith('00')) digits = digits.slice(2)
  else {
    digits = digits.replace(/^0+/, '')
    if (!digits.startsWith(dial) || digits.length - dial.length < 6) digits = dial + digits
  }
  if (digits.includes('+')) return null
  const national = digits.startsWith(dial) ? digits.slice(dial.length) : digits
  if (national.length < 6 || national.length > 14 || digits.length > 15) return null
  return '+' + digits
}

export function countryForDial(dial: string): ArabCountry | undefined {
  return ARAB_COUNTRIES.find((country) => country.dial === dial)
}
