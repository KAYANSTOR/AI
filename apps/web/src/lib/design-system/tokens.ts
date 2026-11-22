export const brandColors = {
  primary: '#D8E2D0',
  secondary: '#1F3B22',
  accent: '#F2D600',
} as const

/** Theme preview colors are derived from the brand palette, not duplicated. */
export const themeColors = {
  light: brandColors.primary,
  dark: brandColors.secondary,
} as const

export const textDirections = {
  ar: 'rtl',
  en: 'ltr',
} as const

export type ThemeMode = keyof typeof themeColors
export type SupportedLocale = keyof typeof textDirections
