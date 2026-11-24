import React from 'react';
import {
  AlertTriangle,
  CheckCircle2,
  Clock,
  Info,
  X,
  XCircle,
  ArrowUpLeft,
} from 'lucide-react';
import { useFocusTrap } from '../../hooks/useFocusTrap';

export function KayanLogoMark({ className = 'w-8 h-8' }: { className?: string }) {
  return (
    <svg
      viewBox="0 0 36 36"
      fill="none"
      xmlns="http://www.w3.org/2000/svg"
      className={className}
      aria-hidden="true"
    >
      <rect width="36" height="36" rx="8" fill="#1F3B22" />
      <path
        d="M11 10V26M11 18L21 10M15.5 14.5L24.5 26"
        stroke="#D8E2D0"
        strokeWidth="2.8"
        strokeLinecap="round"
        strokeLinejoin="round"
      />
      <rect x="23.5" y="10" width="4" height="4" rx="1" fill="#F2D600" />
    </svg>
  );
}

export function PageHeader({
  title,
  subtitle,
  action,
}: {
  title: string;
  subtitle?: string;
  action?: React.ReactNode;
}) {
  return (
    <div className="flex flex-col sm:flex-row sm:items-end justify-between gap-4 pb-6 border-b border-[var(--k-line)]">
      <div className="space-y-1 min-w-0">
        <h1 className="text-2xl font-bold tracking-tight text-[var(--k-ink)]">{title}</h1>
        {subtitle && (
          <p className="text-sm text-[var(--k-ink-muted)] max-w-3xl leading-relaxed">{subtitle}</p>
        )}
      </div>
      {action && <div className="flex flex-wrap items-center gap-2 max-w-full shrink-0">{action}</div>}
    </div>
  );
}

export function MetricTile({
  label,
  value,
  subtext,
  deltaPct,
  tone = 'default',
  onClick,
}: {
  label: string;
  value: string | number;
  subtext?: string;
  deltaPct?: number | null;
  tone?: 'default' | 'sage' | 'success' | 'warning' | 'danger';
  onClick?: () => void;
}) {
  const surfaceClass =
    tone === 'sage'
      ? 'bg-[var(--k-sage-tint)] border-[var(--k-line-strong)]'
      : 'bg-[var(--k-surface)] border-[var(--k-line)]';

  const valueColor =
    tone === 'danger'
      ? 'text-[var(--k-danger)]'
      : tone === 'warning'
        ? 'text-[var(--k-warning)]'
        : tone === 'success'
          ? 'text-[var(--k-success)]'
          : 'text-[var(--k-ink)]';

  const content = (
    <div className="flex flex-col justify-between h-full gap-2 text-start">
      <div className="flex items-center justify-between gap-2">
        <span className="text-xs font-medium text-[var(--k-ink-muted)] truncate">{label}</span>
        {onClick && (
          <ArrowUpLeft
            className="w-3.5 h-3.5 text-[var(--k-ink-muted)] opacity-60 group-hover:opacity-100 transition-opacity shrink-0"
            aria-hidden="true"
          />
        )}
      </div>
      <div className={`text-2xl font-bold font-mono tabular-nums tracking-tight ${valueColor}`}>
        {value}
      </div>
      {(subtext || deltaPct !== undefined) && (
        <div className="flex items-center gap-1.5 text-xs text-[var(--k-ink-muted)] min-w-0">
          {deltaPct !== undefined && deltaPct !== null && (
            <span
              className={`font-mono tabular-nums font-medium shrink-0 ${
                deltaPct > 0
                  ? 'text-[var(--k-success)]'
                  : deltaPct < 0
                    ? 'text-[var(--k-danger)]'
                    : 'text-[var(--k-ink-muted)]'
              }`}
              dir="ltr"
            >
              {deltaPct > 0 ? `+${deltaPct}%` : `${deltaPct}%`}
            </span>
          )}
          {deltaPct !== undefined && deltaPct !== null && subtext && (
            <span aria-hidden="true" className="opacity-50">·</span>
          )}
          {subtext && <span className="truncate">{subtext}</span>}
        </div>
      )}
    </div>
  );

  if (onClick) {
    return (
      <button
        type="button"
        onClick={onClick}
        className={`group p-4 rounded-xl border ${surfaceClass} hover:border-[var(--k-brand-forest)] transition-colors focus-visible:outline-2 focus-visible:outline-[var(--k-brand-forest)] text-start w-full`}
      >
        {content}
      </button>
    );
  }

  return <div className={`p-4 rounded-xl border ${surfaceClass}`}>{content}</div>;
}

export function StatusText({
  status,
  label,
}: {
  status: 'ok' | 'warn' | 'error' | 'muted' | 'info';
  label: string;
}) {
  const styles = {
    ok: { color: 'text-[var(--k-success)]', Icon: CheckCircle2 },
    warn: { color: 'text-[var(--k-warning)]', Icon: AlertTriangle },
    error: { color: 'text-[var(--k-danger)]', Icon: XCircle },
    info: { color: 'text-[var(--k-info)]', Icon: Info },
    muted: { color: 'text-[var(--k-ink-muted)]', Icon: Clock },
  }[status];

  const IconComp = styles.Icon;
  return (
    <span className={`inline-flex items-center gap-1.5 text-xs font-medium whitespace-nowrap ${styles.color}`}>
      <IconComp className="w-3.5 h-3.5 shrink-0" aria-hidden="true" />
      <span>{label}</span>
    </span>
  );
}

export function EmptyState({
  title,
  description,
  action,
}: {
  title: string;
  description: string;
  action?: React.ReactNode;
}) {
  return (
    <div className="py-12 px-6 text-center rounded-xl border border-dashed border-[var(--k-line-strong)] bg-[var(--k-surface)]">
      <p className="text-base font-semibold text-[var(--k-ink)]">{title}</p>
      <p className="text-sm text-[var(--k-ink-muted)] mt-1.5 max-w-lg mx-auto leading-relaxed">
        {description}
      </p>
      {action && <div className="mt-5 flex justify-center">{action}</div>}
    </div>
  );
}

export function TableSkeleton({ rows = 5 }: { rows?: number }) {
  return (
    <div className="rounded-xl border border-[var(--k-line)] bg-[var(--k-surface)] overflow-hidden">
      <div className="h-10 bg-[var(--k-surface-subtle)] border-b border-[var(--k-line)]" />
      {Array.from({ length: rows }).map((_, idx) => (
        <div
          key={idx}
          className="h-11 px-4 flex items-center gap-4 border-b border-[var(--k-line)] last:border-b-0 animate-pulse"
        >
          <div className="h-3 w-1/4 rounded bg-[var(--k-surface-subtle)]" />
          <div className="h-3 w-1/5 rounded bg-[var(--k-surface-subtle)]" />
          <div className="h-3 w-1/6 rounded bg-[var(--k-surface-subtle)]" />
          <div className="h-3 w-1/6 rounded bg-[var(--k-surface-subtle)] ms-auto" />
        </div>
      ))}
    </div>
  );
}

export function ModalDialog({
  open,title,subtitle,onClose,children,maxWidth='max-w-xl',
}:{
  open:boolean;title:string;subtitle?:string;onClose:()=>void;children:React.ReactNode;maxWidth?:string;
}) {
  const titleId=React.useId();
  // Focus trap + Escape + focus restore to the opener on close.
  const panelRef=useFocusTrap<HTMLDivElement>(open,onClose);
  if(!open)return null;
  return (
    <div className="fixed inset-0 z-[100] flex items-center justify-center bg-black/55 p-3 sm:p-4 overflow-y-auto"
      role="dialog" aria-modal="true" aria-labelledby={titleId} onClick={onClose}>
      <div ref={panelRef} tabIndex={-1} className={`flex max-h-[calc(100dvh-1.5rem)] w-full ${maxWidth} flex-col overflow-hidden rounded-xl border border-[var(--k-line)] bg-[var(--k-surface)] shadow-2xl sm:max-h-[calc(100dvh-2rem)]`}
        onClick={(e)=>e.stopPropagation()}>
        <div className="sticky top-0 z-10 flex shrink-0 items-start justify-between gap-4 border-b border-[var(--k-line)] bg-[var(--k-surface)] px-4 py-4 sm:px-5">
          <div className="min-w-0">
            <h2 id={titleId} className="text-base font-bold text-[var(--k-ink)]">{title}</h2>
            {subtitle&&<p className="mt-0.5 text-xs text-[var(--k-ink-muted)]">{subtitle}</p>}
          </div>
          <button type="button" onClick={onClose} aria-label="إغلاق النافذة"
            className="inline-flex min-h-[44px] min-w-[44px] shrink-0 items-center justify-center rounded-lg text-[var(--k-ink-muted)] transition-colors hover:bg-[var(--k-surface-subtle)] hover:text-[var(--k-ink)]">
            <X className="h-4 w-4"/>
          </button>
        </div>
        <div className="min-h-0 flex-1 overflow-y-auto p-4 pb-[calc(1rem+env(safe-area-inset-bottom))] sm:p-5">{children}</div>
      </div>
    </div>
  );
}

export function ConfirmActionModal({
  open,
  title,
  description,
  previewLines,
  confirmLabel = 'تأكيد التنفيذ',
  requireReason = false,
  danger = false,
  busy = false,
  onCancel,
  onConfirm,
}: {
  open: boolean;
  title: string;
  description: string;
  previewLines?: string[];
  confirmLabel?: string;
  requireReason?: boolean;
  danger?: boolean;
  busy?: boolean;
  onCancel: () => void;
  onConfirm: (reason: string) => void;
}) {
  const [reason, setReason] = React.useState('');

  React.useEffect(() => {
    if (!open) setReason('');
  }, [open]);

  if (!open) return null;
  return (
    <ModalDialog open={open} title={title} onClose={onCancel} maxWidth="max-w-md">
      <div className="space-y-4">
        <p className="text-sm text-[var(--k-ink-secondary)] leading-relaxed">{description}</p>
        {previewLines && previewLines.length > 0 && (
          <div className="p-3 rounded-lg bg-[var(--k-surface-subtle)] border border-[var(--k-line)] space-y-1">
            <p className="text-xs font-semibold text-[var(--k-ink)]">معاينة التغيير قبل التنفيذ:</p>
            {previewLines.map((line, i) => (
              <p key={i} className="text-xs text-[var(--k-ink-secondary)]">
                · {line}
              </p>
            ))}
          </div>
        )}
        <div>
          <label className="block text-xs font-medium text-[var(--k-ink-secondary)] mb-1.5">
            {requireReason ? 'سبب الإجراء الإداري (إلزامي لسجل التدقيق)' : 'ملاحظة أو سبب الإجراء (اختياري لسجل التدقيق)'}
          </label>
          <textarea
            value={reason}
            onChange={(e) => setReason(e.target.value)}
            rows={2}
            placeholder="اكتب السبب الإداري لتوثيقه في سجل التدقيق..."
            className="w-full px-3 py-2 text-sm rounded-lg border border-[var(--k-line-strong)] bg-[var(--k-surface)] text-[var(--k-ink)] focus:outline-none focus:border-[var(--k-brand-forest)]"
          />
        </div>
        <div className="flex items-center justify-end gap-2 pt-2">
          <button
            type="button"
            onClick={onCancel}
            className="px-4 py-2 text-xs font-medium rounded-lg border border-[var(--k-line-strong)] text-[var(--k-ink-secondary)] hover:bg-[var(--k-surface-subtle)] whitespace-nowrap"
          >
            إلغاء
          </button>
          <button
            type="button"
            disabled={busy || (requireReason && reason.trim().length < 3)}
            onClick={() => onConfirm(reason.trim())}
            className={`px-4 py-2 text-xs font-semibold rounded-lg whitespace-nowrap transition-opacity disabled:opacity-50 ${
              danger
                ? 'bg-[var(--k-danger)] text-white'
                : 'bg-[var(--k-brand-forest)] text-white'
            }`}
          >
            {busy ? 'جاري التنفيذ...' : confirmLabel}
          </button>
        </div>
      </div>
    </ModalDialog>
  );
}

export const primaryBtnClass =
  'inline-flex min-h-[44px] items-center justify-center gap-2 px-4 py-2 text-xs font-semibold rounded-lg bg-[var(--k-brand-forest)] text-white hover:opacity-90 transition-opacity whitespace-nowrap shrink-0 disabled:opacity-50';

export const secondaryBtnClass =
  'inline-flex min-h-[44px] min-w-[44px] items-center justify-center gap-2 px-3.5 py-2 text-xs font-medium rounded-lg border border-[var(--k-line-strong)] bg-[var(--k-surface)] text-[var(--k-ink)] hover:bg-[var(--k-surface-subtle)] transition-colors whitespace-nowrap shrink-0 disabled:opacity-50';

export const dangerBtnClass =
  'inline-flex min-h-[44px] min-w-[44px] items-center justify-center gap-2 px-3.5 py-2 text-xs font-medium rounded-lg border border-[var(--k-danger)]/40 text-[var(--k-danger)] hover:bg-[var(--k-danger)]/10 transition-colors whitespace-nowrap shrink-0 disabled:opacity-50';



export const inputClass =
  'w-full px-3 py-2 text-base sm:text-sm rounded-lg border border-[var(--k-line-strong)] bg-[var(--k-surface)] text-[var(--k-ink)] placeholder:text-[var(--k-ink-muted)] focus:outline-none focus:border-[var(--k-brand-forest)]';
