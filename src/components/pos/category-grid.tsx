'use client'

import type { ComponentType } from 'react'
import {
  Coffee, Soup, Cookie, Milk, Candy, SprayCan, Shirt, Wheat, Droplets, Fish,
  Apple, Sandwich, IceCreamCone, Pill, Package, LayoutGrid, FolderOpen,
} from 'lucide-react'
import type { ProductCategory } from '@/types/database'

// Sentinel selections for the two tiles that aren't real categories.
export const ALL_PRODUCTS = '__all__'
export const UNCATEGORIZED = '__none__'

interface Props {
  categories: ProductCategory[]
  // category id -> number of products. null while the counts are still loading.
  counts: Record<string, number> | null
  uncategorizedCount: number
  totalCount: number
  onSelect: (selection: string) => void
}

type Icon = ComponentType<{ size?: number; strokeWidth?: number; className?: string }>

// Purely decorative: pick an icon from the category name so the grid is
// quicker to scan at a glance. Anything unrecognised falls back to a box.
const ICON_RULES: Array<[RegExp, Icon]> = [
  [/bever|drink|juice|soda|water|coffee|tea/i, Coffee],
  [/can|soup|noodle|instant/i, Soup],
  [/biscuit|cookie|cracker|snack|chip/i, Cookie],
  [/milk|dairy|cream|cheese/i, Milk],
  [/candy|sweet|chocolate|gum/i, Candy],
  [/clean|soap|detergent|laundry|hygiene|toilet|care/i, SprayCan],
  [/cloth|apparel|shirt/i, Shirt],
  [/rice|grain|flour|bread|bakery/i, Wheat],
  [/sauce|condiment|oil|vinegar|spice|season/i, Droplets],
  [/fish|meat|frozen|seafood/i, Fish],
  [/fruit|veg|fresh|produce/i, Apple],
  [/meal|food|eatery|canteen|sandwich|ulam/i, Sandwich],
  [/ice|dessert/i, IceCreamCone],
  [/med|pharma|health|vitamin/i, Pill],
]

function iconFor(name: string): Icon {
  for (const [pattern, icon] of ICON_RULES) if (pattern.test(name)) return icon
  return Package
}

export default function CategoryGrid({ categories, counts, uncategorizedCount, totalCount, onSelect }: Props) {
  return (
    <div className="grid grid-cols-2 sm:grid-cols-3 xl:grid-cols-4 gap-3">
      {categories.map(cat => (
        <CategoryCard
          key={cat.id}
          label={cat.name}
          icon={iconFor(cat.name)}
          count={counts ? (counts[cat.id] ?? 0) : null}
          onClick={() => onSelect(cat.id)}
        />
      ))}
      {uncategorizedCount > 0 && (
        <CategoryCard
          label="Uncategorized"
          icon={FolderOpen}
          count={uncategorizedCount}
          onClick={() => onSelect(UNCATEGORIZED)}
        />
      )}
      <CategoryCard
        label="All products"
        icon={LayoutGrid}
        count={counts ? totalCount : null}
        muted
        onClick={() => onSelect(ALL_PRODUCTS)}
      />
    </div>
  )
}

function CategoryCard({
  label,
  icon: IconComp,
  count,
  muted,
  onClick,
}: {
  label: string
  icon: Icon
  count: number | null
  muted?: boolean
  onClick: () => void
}) {
  return (
    <button
      onClick={onClick}
      className={`flex flex-col items-start justify-between gap-4 min-h-32 p-4 rounded-2xl border text-left cursor-pointer transition-all hover:border-primary hover:shadow-sm active:scale-95 ${
        muted ? 'bg-surface-sunken border-border border-dashed' : 'bg-surface border-border'
      }`}
    >
      <div className="w-11 h-11 bg-primary-soft rounded-xl flex items-center justify-center">
        <IconComp size={22} className="text-primary" strokeWidth={1.5} />
      </div>
      <div className="min-w-0 w-full">
        <span className="block text-base font-bold text-ink leading-tight line-clamp-2">{label}</span>
        <span className="block text-xs text-ink-faint mt-0.5 tabular">
          {count === null ? ' ' : `${count} item${count === 1 ? '' : 's'}`}
        </span>
      </div>
    </button>
  )
}
