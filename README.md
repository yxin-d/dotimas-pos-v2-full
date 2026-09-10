# POS System — Setup Guide

## Prerequisites
- Node.js 18+
- A Supabase project (free tier is fine)

---

## Step 1 — Scaffold the Next.js app

```bash
npx create-next-app@latest pos-system \
  --typescript --tailwind --eslint --app --src-dir \
  --import-alias "@/*"

cd pos-system
```

## Step 2 — Install dependencies

```bash
npm install @supabase/supabase-js @supabase/ssr \
  zustand react-hook-form zod @hookform/resolvers \
  lucide-react sonner date-fns
```

## Step 3 — Set up Supabase

1. Go to https://supabase.com and create a new project
2. In the dashboard, go to **SQL Editor**
3. Paste and run the contents of `supabase/migrations/0001_initial.sql`
4. Go to **Project Settings → API** and copy:
   - Project URL
   - Anon public key

## Step 4 — Environment variables

```bash
cp .env.example .env.local
```

Fill in `.env.local`:
```
NEXT_PUBLIC_SUPABASE_URL=https://xxxx.supabase.co
NEXT_PUBLIC_SUPABASE_ANON_KEY=your-anon-key
```

## Step 5 — Copy source files

Copy all files from `src/` into your new Next.js project's `src/` folder.

## Step 6 — Create your owner account

1. Go to Supabase Dashboard → **Authentication → Users**
2. Click **Add user** → enter your email + password
3. That's your login — no public signup is needed

## Step 7 — Run it

```bash
npm run dev
```

Open http://localhost:3000 — you'll be redirected to `/login`.

---

## File Overview

```
src/
├── app/
│   ├── (auth)/login/         — Login page + form
│   ├── (app)/
│   │   ├── layout.tsx        — Sidebar shell (protected)
│   │   ├── dashboard/        — Stats, low stock, credit alerts
│   │   └── pos/actions.ts    — Server actions: completeSale, recordCreditPayment
│   └── layout.tsx / page.tsx — Root layout + redirect
│
├── components/layout/
│   └── sidebar.tsx           — Navigation sidebar
│
├── hooks/
│   ├── use-cart.ts           — Zustand cart state
│   └── use-barcode-scanner.ts — Keyboard-emulation barcode hook
│
├── lib/
│   ├── supabase/
│   │   ├── client.ts         — Browser Supabase client
│   │   └── server.ts         — Server Supabase client
│   └── utils/currency.ts     — formatPeso(), formatDate(), todayPH()
│
├── middleware.ts              — Route protection (redirect if not logged in)
└── types/database.ts         — TypeScript types matching your schema
```

---

## What's next to build

In priority order:

1. **`/pos` page** — product grid + cart sidebar + checkout modal
   - Use `useCart` hook for cart state
   - Use `useBarcodeScanner` for scanner input
   - Call `completeSale()` server action on checkout

2. **`/products` page** — list, add, edit products (with barcode field)

3. **`/customers` page** — list customers, view ledger, record credit payments
   - Call `recordCreditPayment()` for utang payments

4. **`/sales` page** — invoice history with filters by date

5. **`/expenses` page** — log and view expenses by date/category

---

## Barcode Scanner Usage

Your scanner works out of the box — it emulates keyboard input.
The `useBarcodeScanner` hook detects fast keystrokes (< 50ms apart)
followed by Enter, then fires your callback with the barcode string.

```tsx
// In your POS page:
useBarcodeScanner(async (barcode) => {
  const { data } = await supabase
    .from('products')
    .select('*')
    .eq('barcode', barcode)
    .single()

  if (data) addItem(data)
  else toast.error(`No product found for barcode: ${barcode}`)
})
```

## Thermal Printer Notes

- 80mm paper → receipt width ~302px
- 58mm paper → receipt width ~220px
- Use `@media print` CSS to hide sidebar and show only receipt
- Trigger with `window.print()` after successful checkout