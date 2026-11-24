/** Normalises Arabic letter variants and diacritics for forgiving search. */
export function foldArabic(value: string): string {
  return value.toLocaleLowerCase().replace(/[أإآ]/g, 'ا').replace(/ة/g, 'ه').replace(/ى/g, 'ي').replace(/[\u064B-\u0652]/g, '').trim()
}
