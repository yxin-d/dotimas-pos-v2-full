/** Format a number as Philippine Peso */
export function formatPeso(amount: number | null | undefined): string {
  if (amount == null) return '₱0.00'
  return new Intl.NumberFormat('en-PH', {
    style: 'currency',
    currency: 'PHP',
  }).format(amount)
}

/** Format date to PH locale */
export function formatDate(dateStr: string, includeTime = false): string {
  return new Intl.DateTimeFormat('en-PH', {
    year: 'numeric',
    month: 'short',
    day: 'numeric',
    ...(includeTime && { hour: '2-digit', minute: '2-digit' }),
    timeZone: 'Asia/Manila',
  }).format(new Date(dateStr))
}

/** Get today's date in Manila time as YYYY-MM-DD */
export function todayPH(): string {
  return new Intl.DateTimeFormat('en-CA', {
    timeZone: 'Asia/Manila',
  }).format(new Date())
}