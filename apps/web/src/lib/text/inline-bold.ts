export type InlineSegment = { text: string; bold: boolean }

/** Splits `**bold**` markup into segments; unmatched markers stay literal text. */
export function parseInlineBold(input: string): InlineSegment[] {
  const segments: InlineSegment[] = []
  const pattern = /\*\*(?=\S)([^*\n]*?\S)\*\*/g
  let last = 0
  for (const match of input.matchAll(pattern)) {
    const start = match.index ?? 0
    if (start > last) segments.push({ text: input.slice(last, start), bold: false })
    segments.push({ text: match[1], bold: true })
    last = start + match[0].length
  }
  if (last < input.length) segments.push({ text: input.slice(last), bold: false })
  return segments.length ? segments : [{ text: input, bold: false }]
}
