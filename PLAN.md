# SmartStock — Active Development Plan

## Reconciled Rork handoff — 8 November 2026

Fetched upstream f15e8ca records owner sign-off for Chapters 1, 2 and 4,
and Chapter 3 ordering/import/PDF device acceptance. Its outstanding database
upgrade was subsequently completed at 20:03 as documented below. These newer
facts supersede older pending acceptance statements in this file. Do not repeat
whole-chapter testing or catalogue correction. Chapter 5 changes require their
own focused acceptance. Existing Order History, supplier-separated PO creation
and business PDF/email details are reused, not newly built in Chapter 5.
Upstream adds no Chapter 5 application code; local work does not overlap it.

## Verified deployment update — 8 November 2026

Chapter 3 production database migration was applied with owner confirmation
on the Windows PC. The saved deployment report confirms all seven product
columns and eight order-item columns, passing integrity checks and unchanged
row counts across all eight compared tables (including 199 products).
A pre-migration pg_dump archive was created and its table/data entries checked;
a full restore has not been tested. This supersedes references below to the
Chapter 3 migration awaiting execution. Do not rerun it.
The owner reports KJ purchasing-detail correction already complete and directs
development to move on: supplier-import/purchasing logic is addressed for now.
Keep KJ as one regression fixture, not a supplier-specific implementation or
gate. Continue Chapter 5; track remaining native acceptance in the release
checklist and reopen importer work only for concrete new defects.

## Authority order (applies to all decisions)

Conflicts are resolved in this order:

1. `01_PRODUCT_BRIEF.md`
2. `03_DECISION_LOG.md`
3. `04_DEVELOPMENT_ROADMAP.md`
4. `02_CURRENT_STATE.md`
5. Rork audits and conversation material

## Active plan: Development Roadmap chapters

Development follows the chapters in **04_DEVELOPMENT_ROADMAP.md**. Each chapter must
deliver a complete customer outcome before the next chapter starts. Do not pull work
forward from later chapters and do not expand a chapter's scope while implementing it.

### Chapter status

- **Chapter 1 — Trustworthy ordering foundation: implemented.**
  Platform note: the project was upgraded Expo SDK 54 → 55 → 57 (separate technical task, Sept 2026, no source-code changes) so Chapter 1 can now be verified on a physical iPhone running the current Expo Go. Device verification is the remaining Chapter 1 step.
  Platform blocker (Oct 2026): Rork's cloud device-preview session is bound to an Expo account the user cannot access (edward@lifestylewindows.com.au). This binding lives on Rork's platform infrastructure and cannot be changed from the project sandbox (verified: no CLI capability, no local credentials, no manifest reference). Rork support has been asked to relink it to edwardo87; ticket unanswered so far. Until then, physical-device verification runs from a local clone of the GitHub repo (edwardo87/rork-stockscan-manager) — expo/.env.example was added for that setup; local CLI and Expo Go both signed in as edwardo87 satisfy the SDK 57 same-account requirement. **8 Oct 2026: local device verification is operational — existing-account auth, stock loading and data retention verified on iPhone.**
  Open defect (recorded in 02_CURRENT_STATE.md, 8 Oct 2026): newly registered accounts error when retrieving stock; existing accounts unaffected. Code inspection confirms an empty catalogue renders cleanly (not a UI mishandling); prime suspects are the unawaited SIGNED_IN load racing the fresh session, or PGRST303 clock skew after the 4 Oct Supabase restore. Store errors are currently invisible in the UI (no screen renders `error`). Diagnosis continues; no code/schema changes pending fix review.
  Approved reconciled scope (v2):
  - [x] Stop PO submission from increasing physical stock (stock is corrected only via stocktake).
  - [x] Real Order History built from existing `purchase_orders`/`order_items` records, newest first, outside Developer Tools entries; existing PO Preview evolved in place, PDF/print/email/delete preserved.
  - [x] Stable PO reference via one shared derivation (`getPoNumber`) used by PDF, email and history.
  - [x] Order success screen links to Order History with honest copy; Order tab gains a History entry point.
  - [x] False CSV "replace" message corrected (products import alert + CSV setup guide).
  - Deferred to Chapter 5 by the Roadmap: scan-time recent-order information (last order date/quantity/PO reference).
- Chapter 2 — Business-neutral identity and suppliers: in progress (Stages 1–5 complete: migration deployed to production; app integration code complete, pending Stage 6 device verification).
  Stage plan (each stage a separate verifiable step):
  - [x] Stage 1 — Database safeguard package (security-hardened 9 Oct 2026, revision 2 corrections 9 Oct 2026 after second independent review): `chapter2-migration.sql` (atomic single-transaction; businesses + suppliers with `created_by`; membership tamper-proof via users-table column-grant revocation + guard trigger whose ONLY bypass is an explicit service_role JWT — claim-less sessions are NOT admin; backfill uses an explicit owner-only DISABLE TRIGGER window; BEFORE INSERT ownership triggers populate/validate business_id on all 4 data tables; composite FKs (supplier_id, business_id)→suppliers enforce same-business supplier links; case/trim-insensitive supplier backfill with email preservation; prerequisite + integrity gates that abort rather than half-apply), `chapter2-rollback.sql` (restores exact pre-migration policies/grants, no CASCADE, table-specific integrity gate that preserves the original purchase_orders.supplier_id TEXT column, explicit list of what is lost), `chapter2-db-safeguards.md` (honest backup guidance — pg_dump is the only restorable option, CSV is a data snapshot only, no password in commands/history, test-restore verification; security model; 9-test two-business negative-access plan with SET LOCAL ROLE authenticated + JWT claim impersonation, canaries to prevent privileged-role false passes; unverified-without-live-DB list).
  - [x] Stage 2 — Migration executed by the owner on production: **Chapter 2 migration Revision 4 deployed 19 October 2026** (owner-run backup + Supabase SQL Editor execution; owner-reported verification: 2 users, 95 products, 2 stocktakes, 58 reorder_log rows, zero missing business assignments; businesses/suppliers tables, ownership triggers and RLS live). **The canonical Revision 4 SQL is not in this repository** — `chapter2-migration.sql` / `chapter2-rollback.sql` hold the earlier Revision 3 safeguard package as a historical artifact and must not be overwritten or re-executed; supply the Revision 4 file to version-control it.
  - [x] Stage 3 — Business profile (23 Oct 2026): Settings → Business Profile screen views/edits the `businesses` row (name, contact email, phone, address, delivery address, logo URL); existing members load their business directly (the claim RPC is only ever called on first-time create); pre-claim accounts get the one-time create + `claim_my_business()` flow. Membership/role never editable in the UI.
  - [x] Stage 4 — Supplier records (23 Oct 2026): Settings → Suppliers screen (list/add/edit/delete) on `suppliers`; deletion refuses while historical POs reference the record and otherwise unlinks products first — supplier TEXT fields and PO snapshots untouched; products/POs link to records by case/trim-insensitive name match; ordering emails used for PO email when a record matches.
  - [x] Stage 5 — De-hardcoded Lifestyle Windows (23 Oct 2026): PDF header + ship-to and the email signature come from the signed-in user's business profile (cached non-throwing lookup; graceful fallbacks when fields are missing). about.tsx contact details are SmartStock's own identity and were intentionally kept.
  - [ ] Stage 6 — Device verification of Chapter 2 acceptance; only then mark the chapter complete. (Blocked on the cloud-preview account binding; local physical-device testing can proceed once the app integration is pulled to the local clone.)
  Defect FIXED (24 Oct 2026): first-time business creation failed on production with Postgres 42501 "new row violates row-level security policy for table businesses". Root cause (empirically confirmed against production): the policies are correct — `businesses_insert_own` (`created_by = auth.uid()`) exists and passes — but the app's INSERT chained `.select().single()`, which PostgREST executes as INSERT … RETURNING, and a RETURNING row must ALSO pass the SELECT policy `businesses_select_member` (`id = users.business_id`, still NULL for a pre-claim account), so the atomic statement aborted. Fix (app-side only, no SQL, RLS untouched): `SupabaseService.createAndClaimBusiness` now inserts blind (no returning, client-generated uuid id), claims membership via `claim_my_business()`, then fetches the authoritative row (visible once membership is set), falling back to submitted values if that read fails. Verified end-to-end against production via the public API with a fresh test account: signup → immediate session (email confirmation is OFF / auto-confirm on the project) → pre-claim users row with null business_id → blind insert 201 → claim RPC returns the id → post-claim read shows the business; negative control (insert WITH returning) reproduces the original 42501 exactly. `chapter2-fix-business-insert.sql` was deleted as unnecessary and based on a disproven diagnosis — do not recreate or run it. Residual artifacts: isolated QA accounts (qa.onboarding.*@smartstock-test.example.com, one holding business "QA Onboarding Test Co") — deletable from the Supabase dashboard if desired; no other data touched.
  Defect FIXED (24 Oct 2026): onboarding "Add Supplier" (first supplier, KJ Bolt) spun forever. Not a database issue — the same insert succeeds on production in 0.5 s under RLS for a freshly claimed business. Root cause: supabase-js auth-lock deadlock — the store's onAuthStateChange callback awaited Supabase queries on SIGNED_IN, and supabase-js emits SIGNED_IN from session recovery (e.g. tab refocus) while holding its auth lock, so the queued getSession() could never run and every later request hung. Reproduced and fix-verified against production by `expo/scripts/verify-auth-deadlock.ts`. Fix: the listener no longer awaits inside the callback (loads deferred, still sequential). Duplicates: impossible — production enforces `suppliers_business_name_uq` (case/trim-insensitive); a retry after a save that did land now shows "already exists" and refreshes the list. During the hang the insert request is never sent, so a stuck save normally stored nothing.
  Chapter 1 follow-up fix (8 Oct 2026, small, schema-independent): auth-listener loads now awaited sequentially (removes the new-account session race) and the Products screen renders the store error banner (retrieval failures were previously invisible). PGRST303 clock-skew issue stays OPEN pending new-account verification on device.
- Chapter 3 — Universal product and purchasing model: complete; owner device acceptance and verified production migration on 8 November 2026.
  All logic verified by `expo/scripts/verify-chapter3.ts` (all checks pass, covering the Roadmap's four examples: screws priced per-100 and per-1,000, silicone cartons of 12, packaging by roll or carton, timber lengths in lineal metres) and by TypeScript/lint checks.
  - [x] Product model: `stock_unit`, `order_unit`, `units_per_order_unit`, `supplier_code`, `purchase_price`, `price_basis_quantity`/`price_basis_unit` on products; legacy `unit` overload retired (CSV `pack_size` no longer mapped to `unit`; digit-containing legacy units fall back to "each").
  - [x] Ordering math: order quantities entered and stored in order units with stock-unit equivalents shown everywhere (order tab, PO preview, PDF, email, Order History); line totals ex GST from price-basis pricing; a missing price yields no total, never $0; ordering still never changes stock.
  - [x] PO output: supplier code (barcode fallback), order-unit quantities with grey stock-equivalent line, unit price ex GST with basis label, line totals and Order Total (ex GST) in PDF, email, preview and history.
  - [x] Product forms: Stock unit field + optional Purchasing section (supplier code, order unit, pack quantity, purchase price ex GST, price-basis qty/unit) on add and edit; edit's "Add to Order" carries the purchasing fields into the order item.
  - [x] CSV import: new column mappings for all Chapter 3 fields (numeric pack/price parsing); template updated with two sample rows; matching-based import — duplicates and conflicts (name-vs-barcode disagreement, price/field changes, ambiguous catalogue keys) are skipped and reported in detail, never silently added or overwritten; existing catalogue never modified by import.
  - [x] Migration files for owner review: `chapter3-migration.sql` (additive, single transaction, idempotent; backfills stock units and price-basis units; non-unique matching indexes) and `chapter3-rollback.sql`. **Applied and integrity-checked on 8 November 2026 with verified backup**; the app detects the columns at runtime and works against both the pre- and post-migration schema.
  - [x] Migration backfill corrected + deployment automated (24 Oct 2026): pack-size descriptions ("box of 12", "pack of 1000", "carton of 6") can no longer become stock units OR price-basis units — they fall back to "each" (previously the price-basis backfill could copy the raw pack string). Verified against an embedded PostgreSQL instance with the production schema shape: clean units backfill correctly, pack strings → "each", historical order items untouched, re-run idempotent. New `deploy-chapter3.ps1` (repo root) reuses the Chapter 2 Windows procedure: PostgreSQL 17 client tools, session-pooler connection, password prompted once and held only in process memory; timestamped pg_dump backup that never overwrites; backup verified via pg_restore listing; stops on any failure; checks deployment state; applies the migration only with `-Apply` AND an interactive DEPLOY confirmation; runs all integrity checks; compares before/after row counts for all 8 data tables; PASS/FAIL report. Safe by default — without `-Apply` it changes nothing.
  - [x] Owner device acceptance and Windows deployment completed 8 November 2026. Backup verified; migration integrity checks passed; all existing row counts preserved. Do not rerun as an outstanding task.
- Chapter 4 — Supplier-document onboarding: owner accepted 8 November 2026; purchasing correction and Chapter3 migration completed.
  - [x] One review workflow for CSV, Excel (.xlsx/.xls, multi-sheet) and text-layer PDF price lists, linked to Chapter 2 supplier records; entry points in Products, Settings and Suppliers.
  - [x] Header detection + editable column mapping; supplier stock-on-hand columns never mapped to the user's stock.
  - [x] Draft review: freight, zero/POA prices, ambiguous/interpreted price bases, pack mismatches and low-confidence PDF rows flagged and not pre-selected; per-row edit; bulk basis fix; select stocked products and import without the old 12-column CSV.
  - [x] Matching at review AND save time; duplicates/conflicts never imported; existing products never modified; chunked save with exact partial-failure reporting.
  - [x] Scanned/encrypted/table-less PDFs explained, never guessed (no OCR).
  - [x] Purchasing fields held on device pre-migration and flushed automatically once the columns exist.
  - [x] Structured template CSV importer kept as fallback.
  - [x] Universal supplier import upgrade (24 Oct 2026):
    - Document recognition (quotation / price list / catalogue / stock report). Repeated page headers are filtered and wrapped rows merged. Freight, charges, totals and GST lines can never be selected.
    - Each value keeps its own meaning: supplier vs customer code; pack qty vs quoted qty vs supplier stock; unit price vs line total; discount; GST.
    - Price bases per each / pack / 100 / 1,000 / lineal metre, with 5-decimal precision. Line-total reconciliation flags mismatches instead of guessing. Sundry/placeholder codes are not treated as identifiers.
    - Back moves one stage at a time and keeps all progress; the discard prompt appears only when closing the workflow.
    - Review: checkbox + bin per row (session-only, restorable), Select all ready / Select all remaining / Deselect all, a Removed view, and full counts.
    - The completion summary counts every product exactly once (fixes "98 added + 152 left out").
  - [x] Automated checks: `expo/scripts/verify-catalogue-import.ts` (171 pass, including 6 real supplier documents in `expo/scripts/fixtures/suppliers/`).
  - [x] Pricing & purchasing correction (25 Oct 2026, after KJ test import showed 3 × "6G X 1/2 STS PAN" = $0.05):
    - Pricing guard: a container order unit with an unknown pack quantity, or a price unit that can't be converted to the stock unit, is flagged as unresolved — never a misleading total. Unresolved lines block PO sending (order tab banner + store hard-block, re-snapshotted from the current product at send time); a missing price stays allowed (no total, never $0).
    - Pack questions: quote lines whose quoted quantity looks like a supplier pack (e.g. 1,000 at $0.0177 each) are asked, not guessed, grouped by quantity for one-tap bulk answers with per-item exceptions. Answers fill order unit + pack quantity; the printed price is kept.
    - Existing products: when the answer shows only purchasing details differ (same supplier/product), "Update purchasing details" shows before → after and updates only order unit, pack quantity and cost — no deletion or re-import; identity, stock, sell price and PO snapshots untouched.
    - Row Info button opens a details sheet (extracted values, interpretation, pricing check, quote details, checks, edit, pack answer); rows show a "Tap to edit" cue.
    - Product cards show supplier cost ex GST with its pricing unit (sell price separate); product detail has a full Purchasing section.
    - Tests: `verify-chapter3.ts` 64 pass; `verify-catalogue-import.ts` 198 pass (KJ regression: pack of 1,000 at $17.70 → 3 packs = $53.10).
  - [x] Device acceptance with real supplier files and purchasing correction completed by owner. Preserve sign-off; do not repeat catalogue repair.
- Chapter 5 — Complete storeroom ordering experience: implementation in progress (8 November 2026).
  - Scan card: supplier/code, order unit, pack quantity, cost and latest available matching PO date/quantity/reference. Historical units retained; repeat ordering allowed.
  - Direct quantity entry with validation; inline add confirmation keeps rapid scanning open; See Order returns to review.
  - iOS keyboard avoidance and dismissal added for quantity entry; type checked, physical keyboard/camera acceptance pending.
  - Supplier-grouped review and subtotals use the same grouping as submission. Confirmation explains separate POs and later sharing.
  - Existing History access and business/supplier PDF/email details retained.
  - Verified: Chapter 5 logic checks, all 64 Chapter 3 pricing checks, TypeScript and whitespace checks.
  - Native acceptance still pending: rapid scans, decimal keyboard/card visibility, two-supplier review, create/reopen PO and PDF/email preview on iPhone. No production orders created or emails sent in this development pass.
- Chapter 6 — Periodic stocktake and optional stock guidance: local implementation in progress, 8 November 2026.
  - Stocktake History linked from tab and success screen: paged session list, saved line details, CSV export/native sharing. Uses existing tables and owner scope; no schema change for history.
  - Export preserves historical counts/names; quoted values escaped, formula-like text neutralised, invalid numeric values fail closed. Every detail page is loaded before export.
  - Removed non-functional notification switches and corrected relevant help text.
  - Optional per-product stock guidance prepared: explicit enable + desired quantity, fresh count at scan time, whole-order-unit suggestion with manual override. No cached stock counts or supplier quantities used as fresh counts.
  - Guidance settings hidden until two database columns exist. `chapter6-guidance-migration.sql` is PREPARED ONLY; not applied or executed against a test database. All existing products default off. Deployment requires separate attended review/backup/test.
  - Passed: CSV regression checks, five mocked history-service tests (12 assertions), guidance calculation checks, TypeScript. Initial iOS JavaScript bundle passed; final bundle recorded in automation state.
  - Parked native checks: stocktake history, export/share and new scan keyboard behaviour. No production reads/writes or orders sent during this development.
  - Stocktake save reliability implemented locally: one transaction for history/lines/counts, durable account-scoped retry journal, same-reference retry, no stale-count overwrite, no success before save acknowledgement. Old partial/fire-and-forget path removed.
  - PostgreSQL 17.11 local tests passed for mid-write rollback, retry without duplication or older-count replay, simultaneous retries, ownership denial, stale/invalid/duplicate inputs and zero/decimal counts. Client retry tests and TypeScript passed.
  - RELEASE GATE: `chapter6-atomic-stocktake.sql` must be reviewed/tested against exact live ownership policies and deployed before releasing this app. Missing function gives an explicit error and preserves counts; no unsafe fallback. Neither Chapter 6 migration has been applied to Supabase.
  - Additional local validation: restored public schema/grants/triggers/RLS from the verified pre-Chapter3 backup, applied Chapter3 locally, and passed atomic-save failure/ownership/retry/concurrency tests on synthetic records under authenticated role with row security ON. Anonymous function execution revoked. Guidance constraints passed against this restored schema too. Auth platform is stubbed locally; hosted auth/native testing remains. Final iOS bundle passed (3,048 modules).
- Chapter 7 — Wider beta readiness: independent help-content slice started 9 November; shared staff/tenancy decisions still parked.
  - Browser single-product QR printing reuses escaped label HTML and embedded PNG, opens its window synchronously, waits for image decoding before print, and closes failed previews. Tests cover blocked popups/download/decode failure and print ordering. Existing provider CORS/PNG response verified with synthetic data only. Native print/scan acceptance remains parked.
  - Native product QR print/share now creates a PDF label with embedded QR PNG, product name, SKU and barcode instead of a text file. Reuses existing QR provider, expo-print and native sharing; download timeout/failure stops label creation, loading state blocks repeat taps. Label text is HTML-escaped. Pure generation/failure tests and TypeScript passed; real PDF rendering/printing/scanning remains a device check.
  - 10 November: native product-detail QR placeholder replaced with an actual image using the existing shelf-label QR service. Fixed black-on-white contrast in both themes, loading indicator, missing-barcode fallback and retry on image failure. TypeScript passed; physical rendering/scanning remains unverified. No new service or dependency.
  - About no longer claims live stock alerts or offline-first operation; describes recorded counts and online saving. How-to now covers the implemented ordering round and unfinished-stocktake recovery. TypeScript and diff checks passed; signed-off application behaviour unchanged.

## Superseded plan

The previous "MVP Stabilisation Plan" (single store migration, RLS lockdown, CSV
validation, reliability hardening, beta checklist) is complete and no longer drives
work. Its remaining known limitations (e.g. Lifestyle Windows hardcoding, insert-only
CSV import) are assigned to Chapters 2–4 of the Roadmap, not to ad-hoc fixes.

## 11 November bounded continuation
- Batch shelf-label browser print and native HTML share now escape product name, SKU, barcode and category using the existing label helper. Previously raw HTML interpolation could change the document when product text contained markup. React preview and encoded QR payload remain unchanged.
- Existing QR helper checks, TypeScript and diff checks passed. Batch image readiness and native PDF batch sharing remain separate unfinished work; no device acceptance or production changes.

## 12 November bounded continuation
- Batch browser QR printing now waits for every image to decode (20-second limit); failed sheets close without printing. Blocked popups and failures give an actionable message. Shared readiness helper also serves single-label printing.
- Browser QR tests cover delayed final image, missing/broken/zero-width images and timeout, alongside existing single-label checks. TypeScript and diff checks pass. Physical print/browser visual acceptance remains unverified; native batch sharing still uses HTML.

## 13 November bounded continuation
- Native batch QR sharing now builds a PDF with embedded PNGs, selected product order and shelf-label dimensions, replacing HTML with remote images. Uses existing download/print/share support; four downloads at a time, each with the existing 20-second timeout. Failure prevents a partial PDF. Preparing state disables repeated taps.
- Synthetic batch checks pass for embedded images, order, dimensions, escaping, concurrency and failure. TypeScript/diff checks pass after correcting an extraction syntax error. Real iPhone PDF layout, scanning and sharing remain pending; no production changes.

## 14 November bounded continuation
- Removed the remaining Developer Tools section from normal Settings, including environment diagnostics and duplicate PO Preview navigation. Existing Order tab History still opens PO history; no ordering or account data behaviour changed.
- TypeScript and diff checks passed; source verification confirmed removed handler references and retained History route. Phone acceptance remains parked.

- 14 November follow-up: QR help now explains online preparation, single/batch PDF sharing, browser pop-ups, retry on failure and sample scan verification. Checked against current routes/services; TypeScript/diff checks pass. Device behaviour still awaits acceptance.

- 15 November: legacy CSV guide corrected: optional template rather than mandatory preparation, current supplier-catalogue route and review steps, no unsupported reorder-alert or guaranteed-duplicate claims. TypeScript/diff checks pass. Import implementation and prior sign-off untouched.

## 15 November substantive continuation
- Fixed business-profile cache race: invalidation discards old pending responses, preventing previous-session details refilling the PDF/email cache. Delayed-response/expiry/failure tests and TypeScript pass.
- Full iOS export exposed Supabase 2.106.1 ESM dynamic import unsupported by Hermes. Native-only Metro resolution now uses the installed CommonJS entry; iOS Hermes export and native query-builder smoke checks pass. No dependency upgrade or network access in smoke tests.
- Prepared RELEASE-HANDOVER.txt and read-only chapter6-release-preflight.sql. SQL is prepared only, not executed; it does not replace migration/hosted-auth testing. Staff permission design remains parked; no RLS or production changes.

- Android Hermes bundle verified with Node (7.9MB), resolving prior local Bun file-read blocker. No code changes needed. Read-only preflight test parked after two local-login attempts; disposable server stopped, no production access or role changes.

## 17 November multi-task development
- Prepared locally tested multi-business memberships, configurable SME limits,
  server-side seat/product caps, owner bootstrap and role-capability configuration.
- Two-connection quota races pass at read-committed/repeatable-read; over-limit
  batches roll back, downgrade preserves records, outsider/self-promotion denied.
- Prepared user-and-business-scoped retry storage with legacy journal protection;
  current v1 behavior remains active until coordinated API/UI release.
- Ported guarded upstream invalid-token recovery; reviewed SDK0.4.2 separately.
  Isolated dependency installs reported success but left empty packages twice;
  parked integration without modifying the working installation. Web EBUSY parked.
- TypeScript and focused synthetic checks pass. Chapter6/7 preflight validated
  locally. See CHAPTER7-FOUNDATION-NOTES.txt; no live deployment or device acceptance.
- Next: authorized business-scoped data APIs, then member invites and coordinated
  scope/UI rollout. Role presets remain configurable rather than blocking backend work.
