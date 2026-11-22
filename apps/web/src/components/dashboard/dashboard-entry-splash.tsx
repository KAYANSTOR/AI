'use client'

import { useState } from 'react'
import { BrandMark, BRAND_NAME, BRAND_TAGLINE } from '@/components/site/brand'

/** Shown once whenever the authenticated dashboard document is entered. */
export function DashboardEntrySplash() {
  const [visible, setVisible] = useState(true)

  if (!visible) return null

  return (
    <div
      className="kayan-entry-splash"
      role="status"
      aria-live="polite"
      aria-label="جارٍ تجهيز مساحة العمل"
      onAnimationEnd={(event) => {
        if (event.target === event.currentTarget) setVisible(false)
      }}
    >
      <div className="kayan-entry-splash__content">
        <div className="kayan-entry-splash__mark-wrap">
          <span className="kayan-entry-splash__orbit" aria-hidden="true" />
          <span className="kayan-entry-splash__glow" aria-hidden="true" />
          <BrandMark className="kayan-entry-splash__mark" />
        </div>
        <div className="kayan-entry-splash__wordmark">{BRAND_NAME}</div>
        <p className="kayan-entry-splash__tagline">{BRAND_TAGLINE}</p>
        <div className="kayan-entry-splash__progress" aria-hidden="true">
          <span />
        </div>
        <span className="kayan-entry-splash__hint">جارٍ تجهيز مساحة عملك</span>
      </div>
    </div>
  )
}
