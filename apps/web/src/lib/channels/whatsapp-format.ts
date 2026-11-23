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
