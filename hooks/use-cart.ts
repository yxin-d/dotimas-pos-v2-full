'use client'

import { create } from 'zustand'
import type { CartItem, Customer, Product } from '@/types/database'
import { CUSTOM_ITEM_PREFIX } from '@/types/database'

interface CartState {
  items: CartItem[]
  customer: Customer | null
}

interface CartStore extends CartState {
  addItem: (product: Product, customPrice?: number) => void
  addCustomItem: (name: string, price: number) => void   // canteen / ad-hoc, via the shortcut key
  removeItem: (productId: string) => void
  updateQty: (productId: string, qty: number) => void
  updateCustomPrice: (productId: string, price: number) => void
  setCustomer: (customer: Customer | null) => void
  clearCart: () => void

  total: () => number
  totalProfit: () => number
  itemCount: () => number
}

export const useCart = create<CartStore>((set, get) => ({
  items: [],
  customer: null,

  addItem: (product, customPrice) => {
    const effectivePrice = customPrice ?? product.price
    set((state) => {
      const existing = state.items.find(i => i.product.id === product.id && !i.customPrice)
      if (existing && !customPrice) {
        const newQty = existing.qty + 1
        return {
          items: state.items.map(i =>
            i.product.id === product.id && !i.customPrice
              ? { ...i, qty: newQty, subtotal: effectivePrice * newQty }
              : i
          ),
        }
      }
      return {
        items: [...state.items, { product, qty: 1, customPrice, subtotal: effectivePrice }],
      }
    })
  },

  // For canteen meals / ad-hoc items with no product record — the shortcut-key quick-add
  addCustomItem: (name, price) => {
    const now = new Date().toISOString()
    const fakeProduct: Product = {
      id: `${CUSTOM_ITEM_PREFIX}${Date.now()}`,
      name,
      volume: null,
      sku: null,
      barcode: null,
      category_id: null,
      price,
      cost: 0,
      stocks: 0,
      low_stock_threshold: 0,
      is_active: true,
      created_at: now,
      updated_at: now,
    }
    set(state => ({
      items: [...state.items, { product: fakeProduct, qty: 1, customPrice: price, subtotal: price }],
    }))
  },

  removeItem: (productId) => {
    set(state => ({ items: state.items.filter(i => i.product.id !== productId) }))
  },

  updateQty: (productId, qty) => {
    if (qty <= 0) { get().removeItem(productId); return }
    set(state => ({
      items: state.items.map(i => {
        if (i.product.id !== productId) return i
        const price = i.customPrice ?? i.product.price
        return { ...i, qty, subtotal: price * qty }
      }),
    }))
  },

  updateCustomPrice: (productId, price) => {
    set(state => ({
      items: state.items.map(i => {
        if (i.product.id !== productId) return i
        return { ...i, customPrice: price, subtotal: price * i.qty }
      }),
    }))
  },

  setCustomer: (customer) => set({ customer }),
  clearCart: () => set({ items: [], customer: null }),

  total: () => get().items.reduce((s, i) => s + i.subtotal, 0),
  totalProfit: () => get().items.reduce((s, i) => {
    const price = i.customPrice ?? i.product.price
    return s + (price - (i.product.cost ?? 0)) * i.qty
  }, 0),
  itemCount: () => get().items.reduce((s, i) => s + i.qty, 0),
}))
