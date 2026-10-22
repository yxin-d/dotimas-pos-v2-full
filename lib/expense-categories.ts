// Shared by the Expenses page and the POS "Add expense" modal.
export type ExpenseCategory = 'supplies' | 'utilities' | 'salary' | 'maintenance' | 'food' | 'other'

export const expenseCategoryLabels: Record<ExpenseCategory, string> = {
  supplies: 'Supplies',
  utilities: 'Utilities',
  salary: 'Salary',
  maintenance: 'Maintenance',
  food: 'Food',
  other: 'Other',
}
