'use client'

// Number fields that behave on a touchscreen.
//
// The old fields were <input type="number" value={0}>: the 0 was a real
// value, not a hint, so tapping in and typing 5 gave "05" (or "50" on some
// tablets, where the caret lands before the 0). These fields:
//   * show nothing when the value is empty/0 — the 0 is only a grey placeholder
//   * select whatever is already there on every tap, so typing REPLACES it
//   * only accept digits and one decimal point
//   * still bring up the number keypad (inputMode), but are type="text",
//     because type="number" can't select-all on tap in every browser.

import { useState, type InputHTMLAttributes } from 'react'

type BaseProps = Omit<InputHTMLAttributes<HTMLInputElement>, 'value' | 'onChange' | 'type'> & {
  /** allow a decimal point (prices, cash). false = whole numbers (stock). */
  decimals?: boolean
}

function clean(raw: string, decimals: boolean): string {
  let s = raw.replace(decimals ? /[^0-9.]/g : /[^0-9]/g, '')
  if (decimals) {
    const dot = s.indexOf('.')
    if (dot !== -1) s = s.slice(0, dot + 1) + s.slice(dot + 1).replace(/\./g, '')
  }
  // drop leading zeros ("05" -> "5") but keep "0" and "0.5"
  s = s.replace(/^0+(?=\d)/, '')
  return s
}

// Select everything on EVERY tap — not only the first one. A cashier who
// taps the amount again to retype it should replace it, not append to it
// ("150" + "200" must not become "150200").
function selectAll(e: React.SyntheticEvent<HTMLInputElement>) {
  const el = e.currentTarget
  // after the tap has placed the caret, select everything
  requestAnimationFrame(() => el.select())
}

/** For forms that keep the amount as a string ('' = not entered yet). */
export function DecimalInput({
  value,
  onChange,
  decimals = true,
  onFocus,
  onPointerUp,
  ...rest
}: BaseProps & { value: string; onChange: (value: string) => void }) {
  return (
    <input
      {...rest}
      type="text"
      inputMode={decimals ? 'decimal' : 'numeric'}
      autoComplete="off"
      value={value}
      onChange={e => onChange(clean(e.target.value, decimals))}
      onFocus={e => { selectAll(e); onFocus?.(e) }}
      onPointerUp={e => { selectAll(e); onPointerUp?.(e) }}
    />
  )
}

/**
 * For forms that keep the amount as a number. 0 shows as an empty field with
 * a "0" placeholder; clearing the field gives 0 back.
 */
export function NumberInput({
  value,
  onValueChange,
  decimals = true,
  placeholder = '0',
  onFocus,
  onPointerUp,
  ...rest
}: BaseProps & { value: number; onValueChange: (value: number) => void }) {
  const toDraft = (v: number) => (v ? String(v) : '')
  const [draft, setDraft] = useState(() => toDraft(value))
  const [lastValue, setLastValue] = useState(value)

  // The value changed from outside (e.g. a different product was opened):
  // show it, unless it's just what's being typed (so "1." isn't wiped to "1").
  if (value !== lastValue) {
    setLastValue(value)
    if ((parseFloat(draft) || 0) !== value) setDraft(toDraft(value))
  }

  return (
    <input
      {...rest}
      type="text"
      inputMode={decimals ? 'decimal' : 'numeric'}
      autoComplete="off"
      placeholder={placeholder}
      value={draft}
      onChange={e => {
        const next = clean(e.target.value, decimals)
        setDraft(next)
        const n = next === '' || next === '.' ? 0 : parseFloat(next)
        setLastValue(n)
        onValueChange(n)
      }}
      onFocus={e => { selectAll(e); onFocus?.(e) }}
      onPointerUp={e => { selectAll(e); onPointerUp?.(e) }}
    />
  )
}
