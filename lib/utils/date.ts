// The store runs on Manila time, but `new Date().toISOString()` is UTC — so
// between 00:00 and 08:00 Manila it returns *yesterday's* date. Always use
// these helpers for "what day is it" logic. Mirrors public.business_date() in
// the database.

const MANILA = 'Asia/Manila'

/** YYYY-MM-DD for the given moment in Manila (defaults to now). */
export function manilaDate(d: Date = new Date()): string {
  // en-CA formats as YYYY-MM-DD
  return new Intl.DateTimeFormat('en-CA', {
    timeZone: MANILA,
    year: 'numeric',
    month: '2-digit',
    day: '2-digit',
  }).format(d)
}

/** YYYY-MM-01 for the current Manila month. */
export function manilaMonthStart(d: Date = new Date()): string {
  return `${manilaDate(d).slice(0, 7)}-01`
}
