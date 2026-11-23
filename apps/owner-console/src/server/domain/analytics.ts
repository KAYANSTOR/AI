export type PeriodGranularity = 'day' | 'week' | 'month' | 'year' | 'custom';

export interface DateWindow {
  startIso: string;
  endIso: string;
  prevStartIso: string;
  prevEndIso: string;
  days: number;
}

export function resolvePeriodWindow(
  period: PeriodGranularity,
  customStart?: string,
  customEnd?: string,
  now = new Date()
): DateWindow {
  const end = customEnd ? new Date(customEnd) : new Date(now);
  if (Number.isNaN(end.getTime())) {
    throw new Error('Invalid end date');
  }
  end.setUTCHours(23, 59, 59, 999);

  let start: Date;
  if (period === 'custom' && customStart) {
    start = new Date(customStart);
    if (Number.isNaN(start.getTime())) {
      throw new Error('Invalid start date');
    }
    start.setUTCHours(0, 0, 0, 0);
  } else {
    start = new Date(end);
    const daysBack =
      period === 'day' ? 1 : period === 'week' ? 7 : period === 'year' ? 365 : 30;
    start.setUTCDate(start.getUTCDate() - (daysBack - 1));
    start.setUTCHours(0, 0, 0, 0);
  }

  if (start > end) {
    throw new Error('Start date cannot be after end date');
  }

  const spanMs = Math.max(86_400_000, end.getTime() - start.getTime() + 1);
  const days = Math.max(1, Math.round(spanMs / 86_400_000));
  const prevEnd = new Date(start.getTime() - 1);
  const prevStart = new Date(prevEnd.getTime() - spanMs + 1);

  return {
    startIso: start.toISOString(),
    endIso: end.toISOString(),
    prevStartIso: prevStart.toISOString(),
    prevEndIso: prevEnd.toISOString(),
    days,
  };
}

export function computeDeltaPercent(current: number, previous: number): number | null {
  if (previous === 0) {
    return current === 0 ? 0 : null;
  }
  return Number((((current - previous) / previous) * 100).toFixed(1));
}

export function computeNetOperatingPosition(input: {
  collectedRevenueUsd: number;
  aiCostUsd: number;
  recordedExpensesUsd: number;
}): {
  totalCostsUsd: number;
  netMarginUsd: number;
  marginPercent: number | null;
} {
  const totalCostsUsd = Number((input.aiCostUsd + input.recordedExpensesUsd).toFixed(4));
  const netMarginUsd = Number((input.collectedRevenueUsd - totalCostsUsd).toFixed(4));
  const marginPercent =
    input.collectedRevenueUsd > 0
      ? Number(((netMarginUsd / input.collectedRevenueUsd) * 100).toFixed(1))
      : null;
  return { totalCostsUsd, netMarginUsd, marginPercent };
}

export function serializeToCsv(
  headers: { key: string; label: string }[],
  rows: Record<string, unknown>[]
): string {
  const escapeCell = (val: unknown): string => {
    const str = val === null || val === undefined ? '' : String(val);
    if (/[",\n\r]/.test(str)) {
      return `"${str.replace(/"/g, '""')}"`;
    }
    return str;
  };
  const lines = [
    headers.map((h) => escapeCell(h.label)).join(','),
    ...rows.map((row) => headers.map((h) => escapeCell(row[h.key])).join(',')),
  ];
  // UTF-8 BOM ensures Excel renders Arabic headers and values properly
  return `\uFEFF${lines.join('\r\n')}`;
}
