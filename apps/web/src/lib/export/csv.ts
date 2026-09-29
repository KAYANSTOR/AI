export function toCsv(rows: Record<string, unknown>[], columns: string[]): string {
  const escape = (value: unknown) => {
    if (value == null) return ''
    const s = String(value)
    if (/[",\n\r]/.test(s)) return `"${s.replace(/"/g, '""')}"`
    return s
  }

  const header = columns.join(',')
  const body = rows.map((row) => columns.map((c) => escape(row[c])).join(',')).join('\n')
  return `${header}\n${body}\n`
}
