export const themeColors = {
  light: '#f4efe5',
  dark: '#0b0f0d',
} as const

export const textDirections = {
  ar: 'rtl',
  en: 'ltr',
} as const

export type ThemeMode = keyof typeof themeColors
export type SupportedLocale = keyof typeof textDirections
