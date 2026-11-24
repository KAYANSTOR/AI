import { describe, expect, it } from 'bun:test'
import { mediaBadgeFor } from '@/lib/inbox/media-badge'

describe('inbox media badges', () => {
  it('shows a voice badge with duration and transcript', () => {
    expect(mediaBadgeFor({ kind: 'audio', voiceNote: true, seconds: 12.4, transcript: 'كم السعر؟', status: 'analyzed' }, 'audio'))
      .toEqual({ kind: 'audio', title: 'رسالة صوتية · 12 ث', detail: 'كم السعر؟', rejected: false })
  })
  it('shows an image badge preferring the caption, then the description', () => {
    expect(mediaBadgeFor({ kind: 'image', caption: 'هل متوفر؟', description: 'حذاء أسود' }, 'image')?.detail).toBe('هل متوفر؟')
    expect(mediaBadgeFor({ kind: 'image', description: 'حذاء أسود' }, 'image')?.detail).toBe('حذاء أسود')
  })
  it('shows a file badge with the file name and flags rejected media', () => {
    expect(mediaBadgeFor({ kind: 'document', fileName: 'menu.pdf', status: 'rejected' }, 'file'))
      .toEqual({ kind: 'document', title: 'menu.pdf', detail: null, rejected: true })
  })
  it('returns null for plain text messages', () => {
    expect(mediaBadgeFor(null, 'text')).toBe(null)
  })
})
