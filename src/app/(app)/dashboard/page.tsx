'use client';

import { useEffect, useState, useRef } from 'react';
import { createClient } from '@/lib/supabase/client';
import { formatPeso } from '@/lib/utils/currency';
import { AlertTriangle, Wallet, Receipt, ChevronLeft, ChevronRight, UtensilsCrossed, ShoppingBasket } from 'lucide-react';
import { manilaDate } from '@/lib/utils/date';
import { toast } from 'sonner';

interface DailyStats {
  gross_sales?: number;
  invoice_count?: number;
  credit_given?: number;
}

// Today's sales split: Meals category vs everything else (store items).
interface CategoryStats {
  meals_sales?: number;
  store_sales?: number;
  meals_invoices?: number;
  store_invoices?: number;
}

interface LowStockItem {
  id: string;
  name: string;
  stocks: number;
  low_stock_threshold: number;
  product_categories?: { name: string } | null;
}

interface CreditItem {
  id: string;
  name: string;
  credit_balance: number;
}

interface ProductWithCategory {
  id: string;
  name: string;
  stocks: number;
  low_stock_threshold: number;
  product_categories?: { name: string } | null;
}

export default function DashboardPage() {
  const [dailyStats, setDailyStats] = useState<DailyStats>({});
  const [categoryStats, setCategoryStats] = useState<CategoryStats>({});
  const [lowStockItems, setLowStockItems] = useState<LowStockItem[]>([]);
  const [creditSummary, setCreditSummary] = useState<CreditItem[]>([]);
  const [loading, setLoading] = useState(true);
  const supabaseRef = useRef<any>(null);

  // Pagination states
  const [lowStockPage, setLowStockPage] = useState(1);
  const [creditPage, setCreditPage] = useState(1);
  const pageSize = 15;

  useEffect(() => {
    supabaseRef.current = createClient();

    const fetchData = async () => {
      setLoading(true);

      // 1. Today's stats (Manila date). Before, this took the latest day that
      // had sales — so the "today" cards showed yesterday's numbers until the
      // first sale of the day.
      const today = manilaDate();
      const [{ data: daily }, { data: split }] = await Promise.all([
        supabaseRef.current.from('daily_summary').select('*').eq('sale_date', today).limit(1),
        supabaseRef.current.from('daily_category_sales').select('*').eq('sale_date', today).limit(1),
      ]);

      // 2. Products with category – explicitly type the result
      const { data: products, error: productsError } = await supabaseRef.current
        .from('products')
        .select(`
          id,
          name,
          stocks,
          low_stock_threshold,
          product_categories ( name )
        `)
        .eq('is_active', true);

      if (productsError) toast.error('Failed to load low-stock data: ' + productsError.message);

      // Cast to our interface (or use type assertion)
      const typedProducts = (products || []) as ProductWithCategory[];

      // Filter low stock: stocks <= threshold AND category is NOT 'meals'
      const lowStock = typedProducts
        .filter(p => p.stocks <= p.low_stock_threshold)
        .filter(p => p.product_categories?.name?.toLowerCase() !== 'meals')
        .map(p => ({
          id: p.id,
          name: p.name,
          stocks: p.stocks,
          low_stock_threshold: p.low_stock_threshold,
          product_categories: p.product_categories,
        }));

      // 3. Credit summary
      const { data: credit } = await supabaseRef.current
        .from('credit_summary')
        .select('*')
        .order('credit_balance', { ascending: false });

      if (daily && daily.length > 0) setDailyStats(daily[0]);
      if (split && split.length > 0) setCategoryStats(split[0]);
      setLowStockItems(lowStock);
      setCreditSummary(credit || []);
      setLoading(false);
    };

    fetchData();
  }, []);

  // Pagination helpers
  const totalLowStock = lowStockItems.length;
  const totalCredit = creditSummary.length;

  const paginatedLowStock = lowStockItems.slice(
    (lowStockPage - 1) * pageSize,
    lowStockPage * pageSize
  );
  const paginatedCredit = creditSummary.slice(
    (creditPage - 1) * pageSize,
    creditPage * pageSize
  );

  const stats = [
    {
      label: 'Gross sales (today)',
      value: formatPeso(dailyStats.gross_sales),
      icon: Receipt,
      tone: 'text-ink',
    },
    {
      label: 'Meals (today)',
      value: formatPeso(categoryStats.meals_sales),
      sub: `${categoryStats.meals_invoices ?? 0} sales`,
      icon: UtensilsCrossed,
      tone: 'text-primary',
    },
    {
      label: 'Store items (today)',
      value: formatPeso(categoryStats.store_sales),
      sub: `${categoryStats.store_invoices ?? 0} sales`,
      icon: ShoppingBasket,
      tone: 'text-ink',
    },
    {
      label: 'Invoices (today)',
      value: (dailyStats.invoice_count ?? 0).toString(),
      icon: Receipt,
      tone: 'text-ink',
    },
    {
      label: 'Credit given (today)',
      value: formatPeso(dailyStats.credit_given),
      icon: Wallet,
      tone: 'text-gold',
    },
  ];

  if (loading) {
    return (
      <div className="p-6 max-w-7xl mx-auto">
        <div className="grid grid-cols-2 md:grid-cols-3 lg:grid-cols-5 gap-4">
          {Array.from({ length: 5 }).map((_, i) => (
            <div key={i} className="h-24 bg-surface rounded-2xl border border-border animate-pulse" />
          ))}
        </div>
      </div>
    );
  }

  return (
    <div className="p-6 max-w-7xl mx-auto">
      {/* Stats grid */}
      <div className="grid grid-cols-2 md:grid-cols-3 lg:grid-cols-5 gap-4 mb-8">
        {stats.map(({ label, value, sub, icon: Icon, tone }: { label: string; value: string; sub?: string; icon: typeof Receipt; tone: string }) => (
          <div key={label} className="bg-surface p-4 rounded-2xl border border-border">
            <div className="flex items-center justify-between mb-2">
              <p className="text-xs font-medium text-ink-faint">{label}</p>
              <Icon size={14} className="text-ink-faint" strokeWidth={1.75} />
            </div>
            <p className={`text-2xl font-bold tabular ${tone}`}>{value}</p>
            {sub && <p className="text-xs text-ink-faint mt-0.5">{sub}</p>}
          </div>
        ))}
      </div>

      <div className="grid grid-cols-1 md:grid-cols-2 gap-6">
        {/* Low Stock Alert */}
        <div className="bg-surface p-5 rounded-2xl border border-border">
          <div className="flex items-center justify-between mb-3">
            <div className="flex items-center gap-2">
              <AlertTriangle size={16} className="text-warning" strokeWidth={1.75} />
              <h2 className="text-sm font-semibold text-ink">Low stock alerts</h2>
            </div>
            {totalLowStock > pageSize && (
              <div className="flex items-center gap-1">
                <button
                  onClick={() => setLowStockPage((p) => Math.max(p - 1, 1))}
                  disabled={lowStockPage === 1}
                  className="p-1 rounded hover:bg-surface-sunken disabled:opacity-50"
                >
                  <ChevronLeft size={14} />
                </button>
                <span className="text-xs text-ink-faint">
                  {lowStockPage} / {Math.ceil(totalLowStock / pageSize)}
                </span>
                <button
                  onClick={() => setLowStockPage((p) => Math.min(p + 1, Math.ceil(totalLowStock / pageSize)))}
                  disabled={lowStockPage === Math.ceil(totalLowStock / pageSize)}
                  className="p-1 rounded hover:bg-surface-sunken disabled:opacity-50"
                >
                  <ChevronRight size={14} />
                </button>
              </div>
            )}
          </div>
          {paginatedLowStock.length === 0 ? (
            <p className="text-sm text-ink-faint">All stocks are healthy.</p>
          ) : (
            <ul className="divide-y divide-border">
              {paginatedLowStock.map((item) => (
                <li key={item.id} className="py-2.5 flex justify-between items-center text-sm">
                  <span className="text-ink">{item.name}</span>
                  <span className="text-danger font-semibold tabular">{item.stocks} left</span>
                </li>
              ))}
            </ul>
          )}
        </div>

        {/* Outstanding Credit */}
        <div className="bg-surface p-5 rounded-2xl border border-border">
          <div className="flex items-center justify-between mb-3">
            <div className="flex items-center gap-2">
              <Wallet size={16} className="text-gold" strokeWidth={1.75} />
              <h2 className="text-sm font-semibold text-ink">Top outstanding credit</h2>
            </div>
            {totalCredit > pageSize && (
              <div className="flex items-center gap-1">
                <button
                  onClick={() => setCreditPage((p) => Math.max(p - 1, 1))}
                  disabled={creditPage === 1}
                  className="p-1 rounded hover:bg-surface-sunken disabled:opacity-50"
                >
                  <ChevronLeft size={14} />
                </button>
                <span className="text-xs text-ink-faint">
                  {creditPage} / {Math.ceil(totalCredit / pageSize)}
                </span>
                <button
                  onClick={() => setCreditPage((p) => Math.min(p + 1, Math.ceil(totalCredit / pageSize)))}
                  disabled={creditPage === Math.ceil(totalCredit / pageSize)}
                  className="p-1 rounded hover:bg-surface-sunken disabled:opacity-50"
                >
                  <ChevronRight size={14} />
                </button>
              </div>
            )}
          </div>
          {paginatedCredit.length === 0 ? (
            <p className="text-sm text-ink-faint">No outstanding balances.</p>
          ) : (
            <ul className="divide-y divide-border">
              {paginatedCredit.map((c) => (
                <li key={c.id} className="py-2.5 flex justify-between items-center text-sm">
                  <span className="text-ink">{c.name}</span>
                  <span className="text-gold font-semibold tabular">{formatPeso(c.credit_balance)}</span>
                </li>
              ))}
            </ul>
          )}
        </div>
      </div>
    </div>
  );
}