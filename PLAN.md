# SmartStock MVP Stabilisation Plan — Beta Readiness

A focused, minimal-change plan to stabilise SmartStock for real-world beta testing. No redesigns, no new features, no enterprise complexity. Every change below is justified by MVP risk.

## 1. Single Source of Truth — Kill the Dual Store (HIGHEST RISK)

**Problem:** Two parallel inventory stores (`inventoryStore.ts` local + `supabaseInventoryStore.ts` Supabase) can cause silent data divergence between devices.

**Plan:**
- Audit every import of `@/store/inventoryStore` across the app.
- Switch all screens/components to `supabaseInventoryStore`.
- Quarantine the old local store (rename to `.legacy.ts`, remove from imports, do not delete yet — safety net during beta).
- Keep AsyncStorage only as an offline cache layer inside the Supabase store, not as a parallel writer.

**Files touched (exact):**
- `app/(tabs)/*.tsx` (all tab screens consuming inventory)
- `app/product/*.tsx`, `app/stocktake/*.tsx`, `app/order/*.tsx`
- `app/po-preview.tsx`, `app/qr-codes-print.tsx`
- `components/ProductCard.tsx`, `components/StocktakeItemCard.tsx`, `components/OrderItemCard.tsx`, `components/Scanner.tsx`, `components/AppWrapper.tsx`
- `store/inventoryStore.ts` → renamed/quarantined

## 2. Supabase Security — Lock RLS Down

**Plan:**
- Inspect existing RLS policies on: `products`, `stocktakes`, `purchase_orders`, `order_items`, `reorder_log`.
- For each table ensure: `enable row level security` + policy `user_id = auth.uid()` for SELECT/INSERT/UPDATE/DELETE.
- Provide a single SQL migration script the user runs once in Supabase SQL editor.
- Verify every client query/insert sends `user_id` (already partially done — confirm in `supabaseService.ts`).

**Files touched:**
- `services/supabaseService.ts` (audit + ensure user_id filtering everywhere)
- New: `supabase-rls.sql` (one-shot script for the user)

## 3. CSV/XLSX Onboarding — The Primary Setup Path

**Plan:**
- Confirm `csvImportService.ts` parses realistic Excel-exported CSVs (delimiter, BOM, quoted fields).
- Add row-level validation with line-number error messages ("Row 14: missing SKU").
- Add a downloadable sample template (`smartstock-template.csv`) accessible from setup-guide / import screen.
- Add visible progress + summary ("Imported 142 products, 3 skipped").
- Hard-fail safely on malformed files instead of partial writes.

**Files touched:**
- `services/csvImportService.ts`
- `app/setup-guide.tsx` (link to template + import entry)
- Possibly a small import results screen (or inline modal — no new screen unless required).

## 4. Reliability of Core Workflows

For each of: inventory updates, stocktake save, QR scan, PO generation, PDF preview, supplier email — add the missing reliability layer only.

**Plan (per workflow):**
- Wrap mutations in try/catch with user-visible toast/alert on failure.
- Add loading indicators on save buttons (disable while pending).
- Add explicit success confirmation ("Stocktake saved").
- Remove any silent `catch {}` blocks.
- Ensure Supabase errors surface — never swallowed.

**Files touched:**
- `store/supabaseInventoryStore.ts` (error propagation)
- `app/stocktake/[id].tsx`, `app/order/[id].tsx`, `app/po-preview.tsx`
- `components/Scanner.tsx` (camera permission + not-found feedback)
- `services/pdfService.ts`, `services/emailService.ts` (surface failures)

## 5. Device Beta Verification Checklist

No code — a written test script for the user to run on a physical device covering:
- Sign up → log in → empty state
- CSV import of a realistic file (50+ rows)
- QR scan → adjust qty → confirm Supabase row updated
- Print QR labels
- Full stocktake → save → reopen → verify persisted
- Generate PO → preview PDF → email supplier
- Log out / log back in on a second device → data appears

## Implementation Order (lowest-risk first)

1. **Audit & migrate inventory store imports** (compile-time safety net).
2. **Quarantine old store.**
3. **Supabase RLS script + service audit.**
4. **Error handling + loading states across core mutations.**
5. **CSV import hardening + sample template.**
6. **Run validation (`runChecks`).**
7. **Hand off beta test script.**

## Highest Risks Remaining Before Beta

- **Data loss from store migration** — mitigated by quarantining (not deleting) the old store, and verifying every screen reads/writes only Supabase before shipping.
- **RLS misconfiguration** — mitigated by single SQL script + manual verification step.
- **CSV edge cases** (Excel UTF-16, semicolon delimiter, trailing commas) — mitigated by strict validation with row-level errors.

## Recommended First Real-World Test

Pick **one friendly business** (the user's closest contact). Sit with them for 90 minutes:
1. Export their existing Excel stock → save as CSV.
2. Sign them up, import the CSV together.
3. Walk through one real stocktake of a small section of their warehouse.
4. Generate one real PO to one real supplier.
5. Collect verbatim feedback. Do not add features — fix only what breaks.

---

**Scope explicitly excluded:** UI redesigns, AI features, reporting dashboards, multi-tenant orgs, realtime collab, role permissions, in-app purchases, push notifications, Google Sheets integration (already legacy — leave dormant).

Approve and I will execute in the order above with minimal code changes.