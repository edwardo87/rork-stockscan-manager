# SmartStock Product Brief

## Product definition

SmartStock is a simple procurement and periodic stocktake tool for small trade and manufacturing businesses.

It is not intended to be a full ERP, warehouse-management system or compulsory perpetual-inventory ledger.

## Customer problem

The original problem is a common storeroom purchasing process:

1. A staff member walks the storeroom with a clipboard.
2. They write down items that need ordering.
3. They return to the office.
4. They separate items by supplier.
5. They re-enter product codes and quantities into purchase orders.
6. They email each supplier.
7. They may order something again because recent order information is difficult to see.

Formal stocktakes create a related problem: products are counted on paper and later re-entered into a spreadsheet.

## Target customer

Small trade and manufacturing businesses that:

- Hold consumables, components or materials in a storeroom.
- Purchase from several repeat suppliers.
- Use manual lists, spreadsheets or memory to manage replenishment.
- Do not want the cost or administrative burden of a full inventory system.
- May perform formal stocktakes only once or twice per year.

Lifestyle Windows can be one testing environment but must not define the product, fields, terminology or success criteria.

## Core promise

Walk the storeroom, scan what needs ordering, see what was recently ordered, enter the required quantity and send correctly grouped supplier purchase orders without using a clipboard or re-entering information.

For stocktakes: scan and record physical counts once without transferring handwritten counts into another system.

## Core onboarding experience

1. Customer enters basic business details.
2. Customer uploads supplier information they already possess, including PDF price lists, quotations, CSV files or Excel files.
3. SmartStock extracts supplier and product information into a draft.
4. Customer reviews uncertain fields and selects the products they actually use.
5. Approved suppliers and products are created.
6. Customer prints SmartStock labels only where an existing barcode cannot be used.

The customer should not be required to reconstruct supplier information in a prescribed spreadsheet before receiving value.

## Core ordering workflow

1. Scan a product barcode or SmartStock QR code.
2. Display product name, supplier, supplier code, order unit, pack quantity and recent order information.
3. User enters the quantity required.
4. Continue scanning.
5. Group items automatically by supplier.
6. Create a separate PO for each supplier.
7. Review, generate PDF and email.
8. Record the date, quantity and PO reference for later visibility.

Recent order history must inform the user but must not block another order. The system must not claim goods are outstanding or received unless that status was recorded.

## Core stocktake workflow

1. Start a stocktake independently from normal ordering.
2. Scan applicable products.
3. Enter physical quantities.
4. Record expected, actual and variance where expected data exists.
5. Retain and eventually export the completed stocktake.

Normal purchasing must remain usable when stocktakes occur only once or twice annually.

## Optional secondary controls

Each product may later support:

- Desired stock control enabled or disabled.
- A business-defined desired stock quantity.
- A recommended order quantity when the user supplies a current physical count.
- Optional PO status and receiving.
- Forecasting after reliable history exists.

These features must not slow, complicate or block the basic manual ordering round.

## Product boundaries

SmartStock must not require:

- Continuous recording of every item consumed.
- Weekly stocktakes.
- Compulsory digital goods receiving.
- Automatic ordering without user approval.
- A technically skilled customer.
- Lifestyle Windows-specific information.

## Why a business may pay

The product's commercial value is the combination of:

- Removing clipboard-based order collection.
- Eliminating repeated data entry.
- Automatically separating orders by supplier.
- Producing supplier-ready POs from the storeroom.
- Reducing product-code and quantity transcription errors.
- Showing recent purchases at the point of reordering.
- Simplifying periodic stocktakes.
- Removing the setup burden of manually restructuring supplier documents.

No pricing or demand has yet been validated. A real-business trial is required.

## Real-business trial success

A typical small trade or manufacturing business must be able to:

1. Enter its own business identity.
2. Upload supplier information in its existing format.
3. Review and approve its products without developer-led spreadsheet preparation.
4. Create or use product codes for scanning.
5. Complete an ordering round.
6. Generate and email accurate, business-branded supplier POs.
7. See useful recent ordering history.
8. Complete a separate stocktake when required.
