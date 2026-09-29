'use client'

import { useState } from 'react'
import { FileSpreadsheet, Plus, Filter, Download, Calendar, Mail, FileText, ChevronDown } from 'lucide-react'

// Dummy data for Reports until we hook up to actual API
const dummyReports = [
  { id: '1', name: 'ملخص المبيعات الأسبوعي', type: 'analytics', schedule: '0 9 * * 1', lastRun: '2026-09-28T09:00:00Z', active: true },
  { id: '2', name: 'أداء الوكيل الذكي (شهري)', type: 'conversations', schedule: '0 9 1 * *', lastRun: '2026-09-01T09:00:00Z', active: true },
  { id: '3', name: 'العملاء المحتملون (بدون تواصل)', type: 'leads', schedule: null, lastRun: null, active: false }
]

export default function ReportsPage() {
  const [reports] = useState(dummyReports)

  return (
    <div className="flex flex-col gap-6 p-6">
      <div className="flex items-center justify-between">
        <div>
          <h1 className="text-2xl font-bold text-text">التقارير المحفوظة</h1>
          <p className="text-sm text-text-muted mt-1">
            أدر تقاريرك المحفوظة، فلاتر البيانات، وتصدير الملفات.
          </p>
        </div>
        <button className="flex items-center gap-2 rounded-xl bg-primary px-4 py-2 text-sm font-medium text-primary-foreground hover:bg-primary/90">
          <Plus size={16} />
          إنشاء تقرير جديد
        </button>
      </div>

      <div className="grid gap-6 md:grid-cols-4">
        {/* Filters/Categories Sidebar */}
        <div className="md:col-span-1 space-y-2">
          <div className="rounded-xl border border-border bg-surface p-2">
            <button className="flex w-full items-center justify-between rounded-lg bg-primary-light/20 px-3 py-2 text-sm font-medium text-primary-dark">
              <span>كل التقارير</span>
              <span className="rounded-full bg-primary-light px-2 py-0.5 text-xs text-primary-dark">{reports.length}</span>
            </button>
            <button className="flex w-full items-center justify-between rounded-lg px-3 py-2 text-sm font-medium text-text-muted hover:bg-surface-hover hover:text-text">
              <span>التقارير المجدولة</span>
              <span className="rounded-full bg-background px-2 py-0.5 text-xs">2</span>
            </button>
            <button className="flex w-full items-center justify-between rounded-lg px-3 py-2 text-sm font-medium text-text-muted hover:bg-surface-hover hover:text-text">
              <span>المبيعات والطلبات</span>
            </button>
            <button className="flex w-full items-center justify-between rounded-lg px-3 py-2 text-sm font-medium text-text-muted hover:bg-surface-hover hover:text-text">
              <span>المحادثات والوكيل</span>
            </button>
          </div>
        </div>

        {/* Reports List */}
        <div className="md:col-span-3">
          <div className="rounded-xl border border-border bg-surface overflow-hidden">
            <div className="border-b border-border bg-surface p-4 flex items-center justify-between">
              <div className="flex gap-2">
                <button className="flex items-center gap-2 rounded-lg border border-border bg-background px-3 py-1.5 text-sm font-medium text-text hover:bg-surface-hover">
                  <Filter size={16} className="text-text-muted" />
                  فلتر
                </button>
              </div>
            </div>
            
            <div className="divide-y divide-border">
              {reports.map(report => (
                <div key={report.id} className="flex items-center justify-between p-4 hover:bg-surface-hover transition-colors">
                  <div className="flex items-start gap-4">
                    <div className="mt-1 flex h-10 w-10 shrink-0 items-center justify-center rounded-lg bg-background border border-border">
                      <FileSpreadsheet size={20} className="text-primary" />
                    </div>
                    <div>
                      <h3 className="font-medium text-text">{report.name}</h3>
                      <div className="mt-1 flex flex-wrap items-center gap-3 text-xs text-text-muted">
                        <span className="flex items-center gap-1">
                          <FileText size={14} />
                          نوع التقرير: {report.type}
                        </span>
                        {report.schedule && (
                          <span className="flex items-center gap-1 text-primary">
                            <Calendar size={14} />
                            مجدول ({report.schedule})
                          </span>
                        )}
                        {report.lastRun && (
                          <span className="flex items-center gap-1">
                            <Mail size={14} />
                            آخر تشغيل: {new Date(report.lastRun).toLocaleDateString('ar-SA')}
                          </span>
                        )}
                      </div>
                    </div>
                  </div>
                  <div className="flex items-center gap-2">
                    <button className="flex items-center gap-1.5 rounded-lg border border-border bg-background px-3 py-1.5 text-xs font-medium text-text hover:bg-surface-hover">
                      <Download size={14} />
                      تصدير (CSV)
                    </button>
                    <button className="flex h-8 w-8 items-center justify-center rounded-lg border border-border bg-background hover:bg-surface-hover text-text-muted">
                      <ChevronDown size={16} />
                    </button>
                  </div>
                </div>
              ))}
              
              {reports.length === 0 && (
                <div className="flex flex-col items-center justify-center py-12 text-center">
                  <div className="flex h-12 w-12 items-center justify-center rounded-full bg-background border border-border">
                    <FileSpreadsheet size={24} className="text-text-muted" />
                  </div>
                  <h3 className="mt-4 text-sm font-medium text-text">لا توجد تقارير</h3>
                  <p className="mt-1 text-xs text-text-muted">لم تقم بإنشاء أي تقارير محفوظة بعد.</p>
                </div>
              )}
            </div>
          </div>
        </div>
      </div>
    </div>
  )
}
