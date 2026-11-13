import { describe, expect, test } from 'bun:test'
import { readFileSync, readdirSync } from 'node:fs'
import { join } from 'node:path'
import { buttonClass } from '../src/components/ui/button'
import { cx } from '../src/components/ui/cx'
import { textDirections, themeColors } from '../src/lib/design-system/tokens'

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
    expect(themeColors.light).toBe('#f4efe5')
    expect(themeColors.dark).toBe('#0b0f0d')
    expect(textDirections).toEqual({ ar: 'rtl', en: 'ltr' })
  })

  test('shared UI primitives do not contain raw hex colors', () => {
    const directory = join(process.cwd(), 'src/components/ui')
    const files = readdirSync(directory).filter((file) => file.endsWith('.tsx'))
    for (const file of files) {
      expect(/#[0-9a-f]{3,8}\b/i.test(readFileSync(join(directory, file), 'utf8'))).toBe(false)
    }
  })
})
