# SmartStock — Active Development Plan

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
  Chapter 1 follow-up fix (8 Oct 2026, small, schema-independent): auth-listener loads now awaited sequentially (removes the new-account session race) and the Products screen renders the store error banner (retrieval failures were previously invisible). PGRST303 clock-skew issue stays OPEN pending new-account verification on device.
- Chapter 3 — Universal product and purchasing model: not started.
- Chapter 4 — Supplier-document onboarding: not started.
- Chapter 5 — Complete storeroom ordering experience: not started.
- Chapter 6 — Periodic stocktake and optional stock guidance: not started.
- Chapter 7 — Wider beta readiness: not started.

## Superseded plan

The previous "MVP Stabilisation Plan" (single store migration, RLS lockdown, CSV
validation, reliability hardening, beta checklist) is complete and no longer drives
work. Its remaining known limitations (e.g. Lifestyle Windows hardcoding, insert-only
CSV import) are assigned to Chapters 2–4 of the Roadmap, not to ad-hoc fixes.
