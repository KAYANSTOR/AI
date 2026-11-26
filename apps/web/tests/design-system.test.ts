import { describe, expect, test } from 'bun:test'
import { readFileSync, readdirSync } from 'node:fs'
import { join } from 'node:path'
import { buttonClass } from '../src/components/ui/button'
import { cx } from '../src/components/ui/cx'
import { brandColors, textDirections, themeColors } from '../src/lib/design-system/tokens'

describe('KAYAN AI design system', () => {
  test('combines conditional classes without leaking false values', () => {
    expect(cx('base', false, undefined, 'active')).toBe('base active')
  })

  test('button variants use semantic design tokens', () => {
    expect(buttonClass({ variant: 'primary' })).toContain('bg-primary')
    expect(buttonClass({ variant: 'danger' })).toContain('bg-error')
    expect(buttonClass({ variant: 'outline' })).toContain('border-border-strong')
  })

  test('declares both supported themes and writing directions', () => {
    expect(brandColors).toEqual({ primary: '#D8E2D0', secondary: '#1F3B22', accent: '#F2D600' })
    expect(themeColors.light).toBe(brandColors.primary)
    expect(themeColors.dark).toBe(brandColors.secondary)
    expect(textDirections).toEqual({ ar: 'rtl', en: 'ltr' })
  })

  test('global palette tokens resolve from the three official brand colors', () => {
    const css = readFileSync(join(process.cwd(), 'src/app/globals.css'), 'utf8')
    expect(css).toContain('--brand-primary: #D8E2D0')
    expect(css).toContain('--brand-secondary: #1F3B22')
    expect(css).toContain('--brand-accent: #F2D600')
    expect(css).toContain('--k-primary: var(--brand-primary)')
    expect(css).toContain('--k-primary-dark: var(--brand-secondary)')
    expect(css).toContain('--k-accent: var(--brand-accent)')
  })

  test('dark and light primary surfaces use distinct readable foreground tokens', () => {
    const css = readFileSync(join(process.cwd(), 'src/app/globals.css'), 'utf8')
    expect(css).toContain('--color-primary-dark-foreground: var(--k-primary-dark-foreground)')
    expect(css).toContain('--k-primary-dark-foreground: #FFFFFF')
    expect(css).toContain('--k-primary-foreground: var(--brand-secondary)')
    expect(buttonClass({ variant: 'primary' })).toContain('text-primary-dark-foreground')
    const luminance = (hex: string) => {
      const channels = hex.slice(1).match(/../g)!.map((part) => {
        const value = parseInt(part, 16) / 255
        return value <= 0.04045 ? value / 12.92 : ((value + 0.055) / 1.055) ** 2.4
      })
      return channels[0] * 0.2126 + channels[1] * 0.7152 + channels[2] * 0.0722
    }
    const contrast = (a: string, b: string) => {
      const [low, high] = [luminance(a), luminance(b)].sort((x, y) => x - y)
      return (high + 0.05) / (low + 0.05)
    }
    expect(contrast('#FFFFFF', brandColors.secondary)).toBeGreaterThan(4.5)
    expect(contrast(brandColors.primary, brandColors.secondary)).toBeGreaterThan(4.5)
  })

  test('shared UI primitives do not contain raw hex colors', () => {
    const directory = join(process.cwd(), 'src/components/ui')
    const files = readdirSync(directory).filter((file) => file.endsWith('.tsx'))
    for (const file of files) {
      expect(/#[0-9a-f]{3,8}\b/i.test(readFileSync(join(directory, file), 'utf8'))).toBe(false)
    }
  })
})
