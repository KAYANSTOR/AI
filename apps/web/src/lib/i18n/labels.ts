import { ar } from './ar'

type MappedLabel = { label: string; hint?: string; description?: string }

function getLabel<T extends Record<string, MappedLabel>>(
  values: T,
  id: string,
  field: keyof MappedLabel,
  fallback?: string
) {
  const value = values[id as keyof T]
  return (value?.[field] as string | undefined) ?? fallback ?? id
}

export const businessTypeLabel = (id: string, fallback?: string) =>
  getLabel(ar.businessTypes, id, 'label', fallback)
export const businessTypeHint = (id: string, fallback?: string) =>
  getLabel(ar.businessTypes, id, 'hint', fallback)
export const capabilityLabel = (id: string, fallback?: string) =>
  getLabel(ar.capabilities, id, 'label', fallback)
export const capabilityDescription = (id: string, fallback?: string) =>
  getLabel(ar.capabilities, id, 'description', fallback)
export const leadStatusLabel = (id: string, fallback?: string) =>
  ar.leadStatus[id as keyof typeof ar.leadStatus] ?? fallback ?? id
export const appointmentStatusLabel = (id: string, fallback?: string) =>
  ar.appointmentStatus[id as keyof typeof ar.appointmentStatus] ?? fallback ?? id
export const conversationStatusLabel = (id: string, fallback?: string) =>
  ar.conversationStatus[id as keyof typeof ar.conversationStatus] ?? fallback ?? id
export const conversationStateLabel = (id: string, fallback?: string) =>
  ar.conversationState[id as keyof typeof ar.conversationState] ?? fallback ?? id
export const channelLabel = (id: string, fallback?: string) => {
  const label = ar.channels[id as keyof typeof ar.channels]
  return typeof label === 'string' ? label : fallback ?? id
}
export const roleLabel = (id: string, fallback?: string) =>
  ar.roles[id as keyof typeof ar.roles] ?? fallback ?? id
export const forwardingStatusLabel = (id: string, fallback?: string) =>
  ar.channels.forwardingStatuses[id as keyof typeof ar.channels.forwardingStatuses] ?? fallback ?? id
export const channelVerificationStatusLabel = (id: string, fallback?: string) =>
  ar.channels.verificationStatuses[id as keyof typeof ar.channels.verificationStatuses] ?? fallback ?? id
