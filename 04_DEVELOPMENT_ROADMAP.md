# SmartStock Development Roadmap

Status date: 5 September 2026

## Roadmap principle

Work in chapters that deliver a complete customer outcome. Do not chase isolated features. Supplier-document onboarding is part of the core commercial proposition and must be available before an unsupervised real-business trial.

## Chapter 1: Trustworthy ordering foundation

Outcome: a user can place orders without corrupting stock and can verify recent purchases.

Scope:

- Stop PO submission from increasing physical stock.
- Build a proper order-history screen from existing PO and order-item records.
- Show PO date, supplier, reference, products and quantities.
- Link order success and normal navigation to order history.
- Correct the false CSV replacement message.
- Preserve scan, grouping, PDF, email and stocktake behaviour.

Acceptance:

- Sending a PO leaves current physical stock unchanged.
- A sent PO and its lines are visible outside Developer Tools.
- Users can identify what was ordered, when, how much and on which PO.

## Chapter 2: Business-neutral identity and suppliers

Outcome: any target business can configure itself and send POs under its own identity.

Scope:

- Add a business profile for company name, address, email and phone.
- Remove hardcoded Lifestyle Windows information from PDF and email output.
- Introduce first-class supplier records with name and ordering email at minimum.
- Link products and POs reliably to suppliers.
- Decide and implement the minimum organisation ownership structure needed without prematurely building extensive roles and permissions.

Acceptance:

- A new business enters its details once.
- PDFs and emails use that business's details.
- Suppliers can be created and corrected without editing every product.
- Product grouping uses stable supplier records, not spelling alone.

## Chapter 3: Universal product and purchasing model

Outcome: the database accurately represents normal trade supplier products.

Scope:

- Supplier product code.
- Stock unit.
- Order unit.
- Units per order unit or pack quantity.
- Purchase price excluding GST.
- Price-basis quantity and unit.
- Existing barcode where available; stable SmartStock identifier otherwise.
- Import matching and duplicate protection.
- Migration of existing product data without losing current records.

Test examples:

- Screws counted individually, ordered in boxes of 1,000 and priced per 100.
- Screws ordered and priced per 1,000.
- Silicone counted by cartridge, ordered in cartons of 12 and priced per cartridge.
- Packaging ordered by roll or carton.
- Timber priced per lineal metre and supplied as lengths or packs.

Acceptance:

- Each example can be represented without overloading one field.
- A repeated supplier list cannot silently duplicate the catalogue.
- POs use supplier product codes and clear order quantities.

## Chapter 4: Supplier-document onboarding

Outcome: a non-technical owner can create a usable catalogue from existing supplier information without rebuilding it in a prescribed spreadsheet.

Scope:

- Upload PDF, quotation, CSV and Excel files.
- Extract common supplier and product fields.
- Feed every source into one draft-product format.
- Review screen with include/exclude, edit and uncertainty warnings.
- Supplier normalisation.
- New, changed, unchanged and possible-duplicate handling.
- Explicit approval before import.
- Retain the structured CSV importer as a fallback and bulk tool.

Acceptance:

- The five supplied example documents enter the same review workflow.
- Freight, zero-price lines, ambiguous price bases and supplier-stock quantities are flagged rather than silently misused.
- Customer can select stocked products and import them without manually preparing the old twelve-column CSV.

## Chapter 5: Complete storeroom ordering experience

Outcome: the user completes the original clipboard-to-PO job entirely from the storeroom.

Scope:

- Scan card displays supplier, supplier code, order unit and pack quantity.
- Scan card displays recent order date, quantity and PO reference.
- User enters required order quantity and can continue scanning rapidly.
- Review grouped supplier orders.
- Move PO access out of Developer Tools.
- Confirm final PDF/email contains business and supplier information required for a practical order.

Acceptance:

- A user can complete an ordering round and send all supplier POs without re-entering data at a desk.
- Recent ordering information is visible but never blocks an override order.

## Chapter 6: Periodic stocktake and optional stock guidance

Outcome: businesses can complete periodic counts without creating a continuous inventory burden.

Scope:

- Preserve the independent scan-and-count stocktake.
- Add stocktake history and export/share.
- Add optional desired-stock enabled toggle per product.
- Add business-defined desired quantity.
- Where the user enters a current physical count, calculate an optional suggested order quantity and allow override.
- Correct or remove unsupported alert claims and notification controls.

Acceptance:

- Ordering works even if the last stocktake was six months earlier.
- Desired-stock functions affect only products where enabled.
- Recommendations are clearly suggestions based on a supplied physical count.

## Chapter 7: Wider beta readiness

Outcome: several businesses and their staff can use SmartStock safely with minimal developer involvement.

Scope:

- Shared business accounts and appropriate RLS.
- Invite and manage staff access.
- Reliability, error recovery and onboarding polish.
- Remove remaining developer-only navigation and content.
- Update About, How-to and setup guidance to match delivered functions.
- Validate QR generation behaviour and connectivity expectations.
- Measure onboarding time, ordering-round time, errors and support required.

Acceptance:

- Several employees can access the same business data appropriately.
- A business can onboard and complete the core workflow without developer-led data preparation.
- User-facing claims match tested behaviour.

## Current chapter

Chapter 1 has not started. The previous completed milestone was native PDF preview and email attachment validation.
