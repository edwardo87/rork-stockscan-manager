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
- ~~CSV import says it replaces the current list, but it inserts additional rows and can create duplicates.~~ RESOLVED at the code level 23 Oct 2026 (Chapter 3): repeated imports are matched against the existing catalogue (barcode first, then normalised name); duplicates and conflicts are skipped and reported, never silently re-inserted or overwritten. The alert copy is honest about this. **Note:** matching requires the Chapter 3 columns for full behaviour; it runs against already-loaded products either way.
- No unique constraint prevents duplicate supplier product codes or barcodes. Partially mitigated at the code level 23 Oct 2026 (Chapter 3): import matching prevents duplicate re-imports. Deliberately NOT a database unique constraint — legacy auto-generated barcodes can collide, and duplicates are resolved by review rather than insert failure.
- ~~The PO Code column prints the barcode rather than the supplier product code.~~ RESOLVED at the code level 23 Oct 2026 (Chapter 3): POs (PDF, email, preview, Order History) print the supplier code, falling back to the barcode. **Database change pending owner execution.**
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

- ~~Lifestyle Windows name and contact details are hardcoded in PO PDFs.~~ RESOLVED 23 Oct 2026 (Chapter 2 Stage 5): PO PDF header and ship-to now come from the signed-in user's business profile, with graceful fallbacks when fields are empty.
- ~~Lifestyle Windows details are hardcoded in email signatures.~~ RESOLVED 23 Oct 2026 (Chapter 2 Stage 5): the email signature is built from the business profile.
- `Quote Ref: TBD`, `Due Date: ASAP` and related email wording are embedded purchasing assumptions.

## Current onboarding

The only bulk path is a customer-prepared CSV. Only product name is mandatory, but the supplied template includes twelve columns. Suppliers are derived from strings stored on products. Import is insert-only.

This is the largest commercial barrier because it requires the customer to manually restructure the supplier information that SmartStock is intended to organise.

## Current data limitations

- ~~Records belong directly to an authenticated user, not a business organisation.~~ RESOLVED at the database level 19 Oct 2026 (Chapter 2 migration Revision 4): records belong to a business; app code integration completed 23 Oct 2026.
- ~~Suppliers are not stored as entities.~~ RESOLVED 23 Oct 2026 (Chapter 2 Stage 4): first-class supplier records with CRUD in the app; legacy supplier TEXT fields on products and historical PO snapshots are preserved during the transition.
- ~~`unit` is overloaded and can receive `pack_size` values.~~ RESOLVED at the code level 23 Oct 2026 (Chapter 3): the CSV importer no longer maps `pack_size` to `unit`; stock unit and pack quantity are separate dedicated fields. Legacy `unit` values containing digits (e.g. "box of 1,000") are guarded and fall back to "each". **Database change pending owner execution** (`chapter3-migration.sql`).
- ~~There is no numeric pack quantity.~~ RESOLVED at the code level 23 Oct 2026 (Chapter 3): `units_per_order_unit` records how many stock units one order unit contains (e.g. a "box of 1,000" = 1,000 each). Order quantities are entered and stored in order units; the stock-unit equivalent is always shown. **Database change pending owner execution.**
- ~~There is no order unit.~~ RESOLVED at the code level 23 Oct 2026 (Chapter 3): products carry `stock_unit` + `order_unit`; purchase orders, PDFs, emails and Order History show supplier code, order-unit quantities and the stock equivalent. **Database change pending owner execution.**
- ~~There is no price-basis quantity or unit.~~ RESOLVED at the code level 23 Oct 2026 (Chapter 3): `purchase_price` with `price_basis_quantity`/`price_basis_unit` (e.g. $12.50 per 100 each) drives line totals labelled ex GST; products without a price show no line total rather than $0. **Database change pending owner execution.**
- Current stock is not reliable after a PO because submission inflates it.

## Proven milestone

The most recent successful device test generated a genuine PDF purchase order and opened the mail application with that PDF attached and ready to send.

## Open defect (8 October 2026): new-account stock retrieval error

**Symptom.** During local physical-device testing (Windows PC → local Expo dev server → iPhone, Expo Go), a newly registered SmartStock account reached the app but encountered an error when attempting to retrieve stock. Existing accounts authenticate and load their stock records correctly on the same device and build. Root cause not yet confirmed.

**Verified by code inspection (8 October 2026):**

- A new account with zero products is handled cleanly by design: the products query returns an empty list and the Products tab shows the standard "No Products Found" empty state. An empty catalogue alone cannot produce an error, so the reported error indicates a genuine failure, not an empty-catalogue rendering problem.
- On sign-in, the auth listener fires `loadProducts()` and `loadPurchaseOrders()` without awaiting them, and `SupabaseService.getProducts()` independently re-resolves the session. A session race on a brand-new login can throw `User not authenticated`, or the select can fail on a stale/offset token (PGRST303 clock skew — known to occur after the 4 October Supabase project pause/restore).
- Diagnostic gap: the store's `error` field is set by `loadProducts`/`loadPurchaseOrders` but is not rendered by any screen, so retrieval failures are invisible in the UI. The exact user-visible message and the device console output (lines beginning `Error loading products:` / `Error fetching products:`) are required to confirm which failure occurred.

**Status: OPEN — pending on-device verification with a new account.** The two schema-independent mitigations were implemented 8 October 2026 (auth-listener loads now awaited sequentially; Products screen renders the store error banner). No database schema or data changes. The PGRST303 clock-skew occurrence on the existing account self-recovered after sign-out/sign-in, consistent with the clock-skew diagnosis; the defect remains open until a fresh account completes retrieval without error.

## Chapter 1 device verification (8 October 2026)

Local physical-device verification has partially completed: existing-account authentication, stock record loading, and data retention all verified on an iPhone. Remaining: full ordering round (scan → order → PDF → history), stocktake round, and stock-quantity integrity — blocked until the defect above is resolved.

## Chapter 2 production + integration status (23 October 2026)

**Database (production).** The Chapter 2 migration **Revision 4** was executed by the owner on production Supabase on **19 October 2026**. Owner-reported verification: 2 users, 95 products, 2 stocktakes, 58 reorder_log rows, zero missing business assignments; `businesses` and `suppliers` tables, ownership triggers and RLS are live. **Do not re-run any Chapter 2 migration SQL against production.** The canonical Revision 4 SQL is not in this repository: `chapter2-migration.sql` / `chapter2-rollback.sql` hold the earlier Revision 3 safeguard package as a historical artifact (do not overwrite, do not execute). Supply the Revision 4 file to version-control it.

**App integration (code complete, runChecks passed, not yet device-verified).**

- Business Profile: Settings → Business Profile. Existing members view/edit their business row; pre-claim accounts get the one-time create + `claim_my_business()` flow (never re-called for users that already have a business). Membership/role are read-only in the UI.
- Suppliers: Settings → Suppliers. CRUD on first-class supplier records; deletion is refused while historical POs reference the record, otherwise products are unlinked first. Supplier TEXT fields on products and historical PO snapshots are never modified. Matching products/POs to records is case/trim-insensitive on name.
- PDF/email: header, ship-to and signature are driven by the business profile (cached, non-throwing lookup with empty-field fallbacks). Lifestyle Windows hardcoding removed from `pdfService.ts` and `emailService.ts`; `about.tsx` contact details are SmartStock's own identity and unchanged.
- Ordering: submitting a PO stores `supplier_record_id` and uses the record's ordering email when available; submission still never inflates stock.
- Business scoping relies on the production RLS/ownership triggers; `business_id` is never written by the app on inserts.

**Outstanding:** Stage 6 device acceptance (cloud-preview account binding still unresolved; local clone testing can proceed). Chapter 2 cannot be marked complete until then.

## Immediate position

Do not spend time converting all supplier price lists into the old CSV template. Do not build isolated optional features yet. The next work must align the product foundation and deliver complete customer outcomes in the Roadmap.
