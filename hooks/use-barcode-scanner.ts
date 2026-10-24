'use client'

import { useEffect, useRef } from 'react'

/**
 * Listens for a USB/Bluetooth barcode scanner (it acts like a keyboard that
 * types very fast and presses Enter).
 *
 * A scan is recognised even while the cursor is in a text field. Scanners
 * type each character a few milliseconds apart — far faster than a person —
 * so a burst of 4+ characters followed by Enter is treated as a scan:
 *   * the field the cursor was in is put back the way it was (the barcode
 *     digits don't end up in Name, Search or the cash amount), and
 *   * the Enter is swallowed, so it can't submit a form or complete a sale.
 *
 * The one exception is a field marked `data-barcode-input`: scanning while
 * that field is focused fills it normally, like typing.
 *
 * Usage:
 *   useBarcodeScanner((barcode) => handleBarcode(barcode))
 */

// Scanners send characters ~2–20 ms apart; on-screen and physical keyboard
// typing is well above this.
const MAX_GAP_MS = 35
const MIN_LENGTH = 4

type Field = HTMLInputElement | HTMLTextAreaElement

function isField(el: EventTarget | null): el is Field {
  return el instanceof HTMLInputElement || el instanceof HTMLTextAreaElement
}

// Set a React-controlled field's value so React's onChange sees it.
function restoreValue(el: Field, value: string) {
  const proto = el instanceof HTMLTextAreaElement ? HTMLTextAreaElement.prototype : HTMLInputElement.prototype
  const setter = Object.getOwnPropertyDescriptor(proto, 'value')?.set
  setter?.call(el, value)
  el.dispatchEvent(new Event('input', { bubbles: true }))
}

export function useBarcodeScanner(onScan: (barcode: string) => void) {
  const bufferRef = useRef('')
  const lastKeyRef = useRef(0)
  // the field (and its value) the burst started in, so it can be restored
  const startRef = useRef<{ el: Field; value: string } | null>(null)
  const onScanRef = useRef(onScan)

  useEffect(() => {
    onScanRef.current = onScan
  }, [onScan])

  useEffect(() => {
    function handleKeyDown(e: KeyboardEvent) {
      const target = e.target
      if (isField(target) && target.dataset.barcodeInput !== undefined) return

      const now = performance.now()
      const gap = now - lastKeyRef.current
      lastKeyRef.current = now

      if (e.key === 'Enter') {
        const barcode = bufferRef.current.trim()
        const start = startRef.current
        bufferRef.current = ''
        startRef.current = null
        // whatever comes next starts a fresh burst (back-to-back scans)
        lastKeyRef.current = 0
        if (barcode.length >= MIN_LENGTH && gap <= MAX_GAP_MS * 3) {
          e.preventDefault()
          e.stopPropagation()
          if (start && start.el.value !== start.value) restoreValue(start.el, start.value)
          onScanRef.current(barcode)
        }
        return
      }

      if (e.key.length !== 1 || e.ctrlKey || e.metaKey || e.altKey) return

      if (gap > MAX_GAP_MS) {
        // a new burst may be starting: remember where, and what was there
        bufferRef.current = ''
        startRef.current = isField(target) ? { el: target, value: target.value } : null
      }
      bufferRef.current += e.key
    }

    // capture phase: runs before the focused field or any form handles the key
    window.addEventListener('keydown', handleKeyDown, true)
    return () => window.removeEventListener('keydown', handleKeyDown, true)
  }, [])
}
