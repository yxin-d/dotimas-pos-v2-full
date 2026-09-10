import { forwardRef, type InputHTMLAttributes } from 'react'

interface InputProps extends InputHTMLAttributes<HTMLInputElement> {
  label?: string
  error?: string
  prefix?: string
}

const Input = forwardRef<HTMLInputElement, InputProps>(function Input(
  { label, error, prefix, className = '', id, ...props },
  ref
) {
  const inputId = id ?? props.name

  return (
    <div className="w-full">
      {label && (
        <label
          htmlFor={inputId}
          className="block text-xs font-semibold text-ink-soft mb-1.5"
        >
          {label}
        </label>
      )}
      <div className="relative">
        {prefix && (
          <span className="absolute left-3.5 top-1/2 -translate-y-1/2 text-ink-faint font-medium text-sm pointer-events-none">
            {prefix}
          </span>
        )}
        <input
          ref={ref}
          id={inputId}
          className={`
            w-full rounded-xl border bg-surface px-3.5 py-2.5 text-sm text-ink
            placeholder:text-ink-faint transition-colors
            focus:outline-none focus:ring-2 focus:ring-primary/30 focus:border-primary
            disabled:bg-surface-sunken disabled:cursor-not-allowed
            ${prefix ? 'pl-8' : ''}
            ${error ? 'border-danger' : 'border-border'}
            ${className}
          `}
          {...props}
        />
      </div>
      {error && <p className="mt-1 text-xs text-danger">{error}</p>}
    </div>
  )
})

export default Input
