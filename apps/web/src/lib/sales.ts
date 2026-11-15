export type QuoteItemInput = {
  name: string
  quantity: number
  unitPrice: number
  discount?: number
}

export type QuoteTotals = {
  subtotal: number
  discount: number
  tax: number
  total: number
}

export function calculateQuoteTotals(items: QuoteItemInput[], discount = 0, taxRate = 0): QuoteTotals {
  const subtotal = items.reduce((sum, item) => sum + item.quantity * item.unitPrice, 0)
  const discountValue = Math.max(0, Math.min(discount, subtotal))
  const tax = subtotal > 0 ? (subtotal - discountValue) * taxRate : 0
  const total = subtotal - discountValue + tax

  return { subtotal, discount: discountValue, tax, total }
}

export function validateQuoteTotals(
  quote: { subtotal: number; discount: number; tax: number; total: number },
  items: QuoteItemInput[],
  discount = 0,
  taxRate = 0
): boolean {
  const expected = calculateQuoteTotals(items, discount, taxRate)
  return (
    Math.abs(quote.subtotal - expected.subtotal) < 0.01 &&
    Math.abs(quote.discount - expected.discount) < 0.01 &&
    Math.abs(quote.tax - expected.tax) < 0.01 &&
    Math.abs(quote.total - expected.total) < 0.01
  )
}

export function createOrderFromQuote(quote: { organization_id: string; contact_id: string; total: number }, items: QuoteItemInput[]): { organization_id: string; contact_id: string; total: number; itemCount: number } {
  const totals = calculateQuoteTotals(items)
  if (Math.abs(quote.total - totals.total) > 0.01) {
    throw new Error('quote total mismatch')
  }

  return { organization_id: quote.organization_id, contact_id: quote.contact_id, total: totals.total, itemCount: items.length }
}
