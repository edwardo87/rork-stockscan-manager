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
  Approved reconciled scope (v2):
  - [x] Stop PO submission from increasing physical stock (stock is corrected only via stocktake).
  - [x] Real Order History built from existing `purchase_orders`/`order_items` records, newest first, outside Developer Tools entries; existing PO Preview evolved in place, PDF/print/email/delete preserved.
  - [x] Stable PO reference via one shared derivation (`getPoNumber`) used by PDF, email and history.
  - [x] Order success screen links to Order History with honest copy; Order tab gains a History entry point.
  - [x] False CSV "replace" message corrected (products import alert + CSV setup guide).
  - Deferred to Chapter 5 by the Roadmap: scan-time recent-order information (last order date/quantity/PO reference).
- Chapter 2 — Business-neutral identity and suppliers: not started.
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
