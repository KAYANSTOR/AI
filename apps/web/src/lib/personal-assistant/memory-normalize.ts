import { createHash } from 'node:crypto'

/** Normalize user-authored memory text for stable duplicate detection. */
export function normalizeMemoryContent(input: string): string {
  return input
    .normalize('NFKC')
    .toLocaleLowerCase('ar')
    .replace(/[\u064B-\u0652\u0670\u0640]/g, '')
    .replace(/[إأآ]/g, 'ا')
    .replace(/ة/g, 'ه')
    .replace(/ى/g, 'ي')
    .replace(/\s+/g, ' ')
    .trim()
}

export function memoryContentHash(input: string): string {
  return createHash('sha256').update(normalizeMemoryContent(input), 'utf8').digest('hex')
}
