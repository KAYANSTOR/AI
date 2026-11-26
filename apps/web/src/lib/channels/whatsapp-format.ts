/** Normalize common web Markdown into WhatsApp's supported text formatting. */
export function formatForWhatsApp(text: string): string {
  return text
    // WhatsApp bold uses one pair of asterisks, not Markdown's double pair.
    .replace(/\*\*([^*\n]+?)\*\*/g, '*$1*')
    // Remove heading markers while retaining the heading text.
    .replace(/^\s{0,3}#{1,6}\s+/gm, '')
    // Avoid web-only inline code markers in a plain WhatsApp message.
    .replace(/`([^`\n]+)`/g, '$1')
    .trim()
}

/**
 * Splits a long WhatsApp response into sequential parts without dropping lines,
 * cutting tables/lists blindly, or truncating trailing paragraphs.
 */
export function splitWhatsAppMessage(text: string, maxChunkLength = 3800): string[] {
  const normalized = text.replace(/\r\n?/g, '\n').trim()
  if (!normalized) return []
  const limit = Math.max(200, Math.floor(maxChunkLength))
  if (normalized.length <= limit) return [normalized]

  const chunks: string[] = []
  let remaining = normalized

  while (remaining.length > limit) {
    const window = remaining.slice(0, limit)
    let splitAt = window.lastIndexOf('\n\n')
    if (splitAt < limit * 0.35) {
      const lineCut = window.lastIndexOf('\n')
      if (lineCut >= limit * 0.25) splitAt = lineCut
    }
    if (splitAt < limit * 0.25) {
      const sentenceCut = Math.max(
        window.lastIndexOf('. '),
        window.lastIndexOf('؟ '),
        window.lastIndexOf('! '),
        window.lastIndexOf('، '),
        window.lastIndexOf(' ')
      )
      if (sentenceCut >= limit * 0.25) splitAt = sentenceCut + 1
    }
    if (splitAt <= 0) splitAt = limit

    const piece = remaining.slice(0, splitAt).trim()
    if (piece) chunks.push(piece)
    remaining = remaining.slice(splitAt).trimStart()
  }

  if (remaining) chunks.push(remaining)
  return chunks
}
