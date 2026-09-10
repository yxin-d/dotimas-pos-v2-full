'use client'

import { useEffect, useRef } from 'react'

/**
 * Listens for barcode scanner input (keyboard emulation).
 * Scanners type fast then fire Enter — we detect that pattern.
 *
 * Usage:
 *   useBarcodeScanner((barcode) => handleBarcode(barcode))
 */
export function useBarcodeScanner(onScan: (barcode: string) => void) {
  const bufferRef  = useRef('')
  const lastKeyRef = useRef<number | null>(null)

  useEffect(() => {
    function handleKeyDown(e: KeyboardEvent) {
      // Ignore if user is typing in an input/textarea
      const tag = (e.target as HTMLElement).tagName
      if (tag === 'INPUT' || tag === 'TEXTAREA') return

      const now = Date.now()
      const gap = lastKeyRef.current === null ? Infinity : now - lastKeyRef.current
      lastKeyRef.current = now

      // Scanners type chars < 50ms apart; humans are slower
      if (gap > 100) {
        bufferRef.current = ''
      }

      if (e.key === 'Enter') {
        const barcode = bufferRef.current.trim()
        if (barcode.length >= 4) {
          onScan(barcode)
        }
        bufferRef.current = ''
        return
      }

      if (e.key.length === 1) {
        bufferRef.current += e.key
      }
    }

    window.addEventListener('keydown', handleKeyDown)
    return () => window.removeEventListener('keydown', handleKeyDown)
  }, [onScan])
}