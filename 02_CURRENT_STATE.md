# SmartStock Current State

Status date: 5 September 2026

## Working

- Supabase schema, seven tables, triggers and per-user RLS are live.
- Email/password authentication works.
- Product add, edit and detail screens work.
- CSV parsing handles BOMs, comma or semicolon delimiters, quoted fields, row warnings and UUIDs.
- QR labels can be generated and printed through an external QR service.
- Barcode/QR scanning works for ordering and stocktake.
- Manual order quantities work.
- Items are grouped into separate POs by supplier name.
- Purchase orders persist in Supabase.
- Native PO PDF generation, preview and printing work.
- Native email opens with the PDF attached.
- PO deletion works.
- Stocktake scanning, actual counts, variance recording and product quantity updates work.

## Working but incomplete

- Recent POs exist in a last-five developer preview but there is no proper order-history screen.
- `products.last_ordered`, `order_items`, `purchase_orders` and `reorder_log` retain useful order history, but it is not shown during scanning.
- PO statuses exist but only submitted is actively used.
- Product `cost` exists but is not used in POs.
- `min_stock` creates a visual low-stock badge only.
- AsyncStorage acts as a cache, but meaningful operations require Supabase connectivity. The app is not genuinely offline-first.

## Logically incorrect or unsafe

- Submitting a PO immediately adds the ordered quantity to physical stock even though goods have not arrived.
- CSV import says it replaces the current list, but it inserts additional rows and can create duplicates.
- No unique constraint prevents duplicate supplier product codes or barcodes.
- The PO Code column prints the barcode rather than the supplier product code.
- Help content refers to screens and features that do not exist or uses incorrect navigation paths.
- Notification toggles persist settings but do not trigger notifications.

## Not built

- Business profile and business-neutral PO identity.
- First-class supplier records and supplier maintenance.
- Upload and extraction of PDF, quotation or Excel supplier information.
- Draft product review, selection and correction before import.
- Import matching, deduplication and price-update handling.
- Separate stock unit, order unit, pack quantity and price basis.
- User-facing searchable order history.
- Scan-time recent order information.
- Stocktake export.
- Desired-stock enable toggle and recommended quantities.
- Multi-user shared business accounts.
- Compulsory or optional goods-receiving UI.
- Forecasting.

## Current business-specific dependencies

- Lifestyle Windows name and contact details are hardcoded in PO PDFs.
- Lifestyle Windows details are hardcoded in email signatures.
- `Quote Ref: TBD`, `Due Date: ASAP` and related email wording are embedded purchasing assumptions.

## Current onboarding

The only bulk path is a customer-prepared CSV. Only product name is mandatory, but the supplied template includes twelve columns. Suppliers are derived from strings stored on products. Import is insert-only.

This is the largest commercial barrier because it requires the customer to manually restructure the supplier information that SmartStock is intended to organise.

## Current data limitations

- Records belong directly to an authenticated user, not a business organisation.
- Suppliers are not stored as entities.
- `unit` is overloaded and can receive `pack_size` values.
- There is no numeric pack quantity.
- There is no order unit.
- There is no price-basis quantity or unit.
- Current stock is not reliable after a PO because submission inflates it.

## Proven milestone

The most recent successful device test generated a genuine PDF purchase order and opened the mail application with that PDF attached and ready to send.

## Open defect (8 October 2026): new-account stock retrieval error

**Symptom.** During local physical-device testing (Windows PC → local Expo dev server → iPhone, Expo Go), a newly registered SmartStock account reached the app but encountered an error when attempting to retrieve stock. Existing accounts authenticate and load their stock records correctly on the same device and build. Root cause not yet confirmed.

**Verified by code inspection (8 October 2026):**

- A new account with zero products is handled cleanly by design: the products query returns an empty list and the Products tab shows the standard "No Products Found" empty state. An empty catalogue alone cannot produce an error, so the reported error indicates a genuine failure, not an empty-catalogue rendering problem.
- On sign-in, the auth listener fires `loadProducts()` and `loadPurchaseOrders()` without awaiting them, and `SupabaseService.getProducts()` independently re-resolves the session. A session race on a brand-new login can throw `User not authenticated`, or the select can fail on a stale/offset token (PGRST303 clock skew — known to occur after the 4 October Supabase project pause/restore).
- Diagnostic gap: the store's `error` field is set by `loadProducts`/`loadPurchaseOrders` but is not rendered by any screen, so retrieval failures are invisible in the UI. The exact user-visible message and the device console output (lines beginning `Error loading products:` / `Error fetching products:`) are required to confirm which failure occurred.

**Status: OPEN — diagnosis in progress. No code, schema or data changes made.** Fix proposal pending review.

## Chapter 1 device verification (8 October 2026)

Local physical-device verification has partially completed: existing-account authentication, stock record loading, and data retention all verified on an iPhone. Remaining: full ordering round (scan → order → PDF → history), stocktake round, and stock-quantity integrity — blocked until the defect above is resolved.

## Immediate position

Do not spend time converting all supplier price lists into the old CSV template. Do not build isolated optional features yet. The next work must align the product foundation and deliver complete customer outcomes in the Roadmap.
