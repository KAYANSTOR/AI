/** Personalizes the single supported campaign variable at delivery time. */
export function renderCampaignTemplate(template: string, customerName?: string | null): string {
  const name = customerName?.trim().slice(0, 100) || 'عميلنا العزيز'
  return template.replace(/\{\{customer_name\}\}|\{customer_name\}/g, name)
}
