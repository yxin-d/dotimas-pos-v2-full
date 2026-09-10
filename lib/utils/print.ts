/**
 * Trigger the browser print dialog.
 * The @media print rules in globals.css handle hiding
 * everything except .receipt-only automatically.
 */
export function printReceipt() {
  window.print()
}