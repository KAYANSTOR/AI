'use client'

import { useState } from 'react'
import { useRouter } from 'next/navigation'
import { createOrderAction } from '../actions'
import { Plus, Trash, Loader2 } from 'lucide-react'

type Contact = { id: string; full_name: string | null; phone: string | null }

type DefaultValues = {
  contact_id: string
  quote_id?: string
  notes?: string
  items: { name: string; quantity: number; unit_price: number; discount: number }[]
}

export function OrderForm({ contacts, defaultValues }: { contacts: Contact[], defaultValues?: DefaultValues }) {
  const router = useRouter()
  const [loading, setLoading] = useState(false)
  const [error, setError] = useState<string | null>(null)
  
  const [contactId, setContactId] = useState(defaultValues?.contact_id || contacts[0]?.id || '')
  const [notes, setNotes] = useState(defaultValues?.notes || '')
  const [items, setItems] = useState(defaultValues?.items || [{ name: '', quantity: 1, unit_price: 0, discount: 0 }])
  const quoteId = defaultValues?.quote_id

  const calculateTotal = () => {
    return items.reduce((acc, item) => acc + (item.quantity * item.unit_price) - item.discount, 0)
  }

  const addItem = () => {
    setItems([...items, { name: '', quantity: 1, unit_price: 0, discount: 0 }])
  }

  const removeItem = (index: number) => {
    setItems(items.filter((_, i) => i !== index))
  }

  const updateItem = (index: number, field: string, value: string | number) => {
    const newItems = [...items]
    newItems[index] = { ...newItems[index], [field]: value }
    setItems(newItems)
  }

  const handleSubmit = async (e: React.FormEvent) => {
    e.preventDefault()
    setLoading(true)
    setError(null)
    
    const result = await createOrderAction({
      contact_id: contactId,
      quote_id: quoteId,
      notes,
      items: items.map(i => ({
        ...i,
        quantity: Number(i.quantity),
        unit_price: Number(i.unit_price),
        discount: Number(i.discount)
      }))
    })

    if (!result.ok) {
      setError(result.error || 'حدث خطأ غير متوقع.')
      setLoading(false)
    } else {
      router.push(`/dashboard/orders/${result.orderId}`)
    }
  }

  return (
    <form onSubmit={handleSubmit} className="space-y-6 max-w-4xl">
      {error && <div className="rounded-lg bg-error/15 p-4 text-sm text-error">{error}</div>}
      
      {quoteId && (
        <div className="rounded-lg bg-primary/10 p-4 text-sm text-primary-dark border border-primary/20">
          أنت تقوم بإنشاء طلب بناءً على عرض سعر معتمد مسبقاً.
        </div>
      )}

      <div className="rounded-xl border border-border bg-surface p-6 space-y-4">
        <h2 className="text-lg font-bold text-text">معلومات العميل</h2>
        <div>
          <label className="mb-1 block text-sm font-medium text-text">العميل</label>
          <select 
            value={contactId} 
            onChange={e => setContactId(e.target.value)}
            className="w-full rounded-lg border border-border bg-background p-2.5 text-sm text-text outline-none focus:border-primary disabled:opacity-50"
            required
            disabled={!!quoteId} // If created from quote, do not allow changing the contact
          >
            <option value="" disabled>اختر العميل...</option>
            {contacts.map(c => (
              <option key={c.id} value={c.id}>{c.full_name || c.phone || 'بدون اسم'}</option>
            ))}
          </select>
        </div>
      </div>

      <div className="rounded-xl border border-border bg-surface p-6 space-y-4">
        <h2 className="text-lg font-bold text-text">عناصر الطلب</h2>
        <div className="space-y-3">
          {items.map((item, index) => (
            <div key={index} className="flex flex-wrap items-start gap-3 rounded-lg border border-border p-4 bg-background">
              <div className="flex-1 min-w-[200px]">
                <label className="mb-1 block text-xs font-medium text-text-muted">الخدمة / المنتج</label>
                <input 
                  type="text" 
                  value={item.name} 
                  onChange={e => updateItem(index, 'name', e.target.value)} 
                  className="w-full rounded-md border border-border bg-surface p-2 text-sm outline-none focus:border-primary"
                  required
                />
              </div>
              <div className="w-24">
                <label className="mb-1 block text-xs font-medium text-text-muted">الكمية</label>
                <input 
                  type="number" 
                  min="1"
                  value={item.quantity} 
                  onChange={e => updateItem(index, 'quantity', e.target.value)} 
                  className="w-full rounded-md border border-border bg-surface p-2 text-sm outline-none focus:border-primary"
                  required
                />
              </div>
              <div className="w-32">
                <label className="mb-1 block text-xs font-medium text-text-muted">السعر (SAR)</label>
                <input 
                  type="number" 
                  min="0"
                  step="0.01"
                  value={item.unit_price} 
                  onChange={e => updateItem(index, 'unit_price', e.target.value)} 
                  className="w-full rounded-md border border-border bg-surface p-2 text-sm outline-none focus:border-primary"
                  required
                />
              </div>
              <div className="w-32">
                <label className="mb-1 block text-xs font-medium text-text-muted">الخصم (SAR)</label>
                <input 
                  type="number" 
                  min="0"
                  step="0.01"
                  value={item.discount} 
                  onChange={e => updateItem(index, 'discount', e.target.value)} 
                  className="w-full rounded-md border border-border bg-surface p-2 text-sm outline-none focus:border-primary"
                  required
                />
              </div>
              <div className="mt-6">
                <button type="button" onClick={() => removeItem(index)} className="p-2 text-text-muted hover:text-error transition-colors" disabled={items.length === 1}>
                  <Trash size={18} />
                </button>
              </div>
            </div>
          ))}
        </div>
        
        <button type="button" onClick={addItem} className="inline-flex items-center gap-1 text-sm font-medium text-primary hover:underline">
          <Plus size={16} /> إضافة عنصر
        </button>

        <div className="mt-6 flex justify-between rounded-lg bg-background p-4 border border-border">
          <span className="font-bold text-text">الإجمالي النهائي:</span>
          <span className="font-bold text-primary">{calculateTotal().toFixed(2)} SAR</span>
        </div>
      </div>

      <div className="rounded-xl border border-border bg-surface p-6">
        <label className="mb-1 block text-sm font-medium text-text">ملاحظات إضافية (اختياري)</label>
        <textarea 
          value={notes} 
          onChange={e => setNotes(e.target.value)}
          className="w-full rounded-lg border border-border bg-background p-3 text-sm text-text outline-none focus:border-primary min-h-[100px]"
          placeholder="شروط التسليم..."
        />
      </div>

      <div className="flex justify-end gap-3">
        <button type="button" onClick={() => router.back()} className="rounded-lg px-4 py-2 text-sm font-medium text-text-muted hover:bg-surface transition-colors" disabled={loading}>
          إلغاء
        </button>
        <button type="submit" disabled={loading} className="inline-flex items-center gap-2 rounded-lg bg-primary px-6 py-2 text-sm font-medium text-white hover:bg-primary-dark transition-colors disabled:opacity-50">
          {loading && <Loader2 size={16} className="animate-spin" />}
          حفظ المسودة
        </button>
      </div>
    </form>
  )
}
