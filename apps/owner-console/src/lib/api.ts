// Session token is held strictly in JS memory (never written to localStorage/sessionStorage)
let inMemoryToken: string | null = null;
let unauthorizedHandler: (() => void) | null = null;

export function setOwnerToken(token: string | null): void {
  inMemoryToken = token;
}

export function getOwnerToken(): string | null {
  return inMemoryToken;
}

export function registerUnauthorizedHandler(handler: () => void): void {
  unauthorizedHandler = handler;
}

export class ApiError extends Error {
  status: number;
  code: string;
  constructor(status: number, code: string, message: string) {
    super(message);
    this.status = status;
    this.code = code;
  }
}

export async function apiFetch<T = unknown>(
  path: string,
  options: { method?: string; body?: unknown; skipAuth?: boolean } = {}
): Promise<T> {
  const headers: Record<string, string> = {
    'Content-Type': 'application/json',
    'X-Requested-With': 'KayanOwnerConsole',
  };
  if (!options.skipAuth && inMemoryToken) {
    headers.Authorization = `Bearer ${inMemoryToken}`;
  }

  const res = await fetch(path, {
    method: options.method || 'GET',
    headers,
    body: options.body !== undefined ? JSON.stringify(options.body) : undefined,
  });

  if (res.status === 401 && !options.skipAuth && unauthorizedHandler) {
    inMemoryToken = null;
    unauthorizedHandler();
  }

  const contentType = res.headers.get('content-type') || '';
  if (!res.ok) {
    let errorMsg = `خطأ في الطلب (${res.status})`;
    let errorCode = 'request_failed';
    if (contentType.includes('application/json')) {
      const payload = (await res.json().catch(() => ({}))) as { message?: string; error?: string };
      if (payload.message) errorMsg = payload.message;
      if (payload.error) errorCode = payload.error;
    }
    throw new ApiError(res.status, errorCode, errorMsg);
  }

  if (contentType.includes('application/json')) {
    return (await res.json()) as T;
  }
  return (await res.text()) as unknown as T;
}

export async function downloadOwnerCsv(reportType: string, filename: string): Promise<void> {
  const headers: Record<string, string> = { 'X-Requested-With': 'KayanOwnerConsole' };
  if (inMemoryToken) {
    headers.Authorization = `Bearer ${inMemoryToken}`;
  }
  const res = await fetch(`/api/owner/reports/${encodeURIComponent(reportType)}?format=csv`, { headers });
  if (!res.ok) {
    throw new Error('تعذر تصدير التقرير بصيغة CSV.');
  }
  const blob = await res.blob();
  const url = URL.createObjectURL(blob);
  const a = document.createElement('a');
  a.href = url;
  a.download = filename;
  document.body.appendChild(a);
  a.click();
  a.remove();
  URL.revokeObjectURL(url);
}

export function formatCurrency(value: number | string | null | undefined, currency = 'USD'): string {
  const n = Number(value ?? 0);
  if (!Number.isFinite(n)) return '$0.00';
  if (currency === 'USD') {
    return `$${n.toLocaleString('en-US', { minimumFractionDigits: 2, maximumFractionDigits: n > 0 && n < 1 ? 4 : 2 })}`;
  }
  return `${n.toLocaleString('en-US', { minimumFractionDigits: 2, maximumFractionDigits: 2 })} ${currency}`;
}

export function formatNumber(value: number | string | null | undefined): string {
  const n = Number(value ?? 0);
  if (!Number.isFinite(n)) return '0';
  return n.toLocaleString('en-US');
}

export function formatDateTime(iso: string | null | undefined): string {
  if (!iso) return '—';
  const d = new Date(iso);
  if (Number.isNaN(d.getTime())) return iso;
  return d.toLocaleString('ar-SA', {
    year: 'numeric',
    month: 'short',
    day: 'numeric',
    hour: '2-digit',
    minute: '2-digit',
  });
}
