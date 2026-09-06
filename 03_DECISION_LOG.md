# SmartStock Decision Log

Status date: 5 September 2026

## Confirmed decisions

### Product purpose

SmartStock is a procurement and periodic stocktake tool for small trade and manufacturing businesses. It is not initially a perpetual-inventory system or fully automated replenishment engine.

### Original problem

The primary problem is the clipboard storeroom walk followed by manual supplier separation, PO creation and email. A related problem is re-entering handwritten stocktake counts into spreadsheets.

### Business-neutral product

Lifestyle Windows is a possible testing environment, not the product definition. Requirements and acceptance tests must work for a typical target business.

### Supplier onboarding is core

Uploading existing PDF, quotation, CSV or Excel supplier information, extracting it, reviewing exceptions and approving products is a core onboarding capability. It must not be postponed as an optional final-stage feature.

### Customer review remains mandatory

Document extraction must not silently import uncertain commercial data. The customer reviews product inclusion, units, pack quantities, price bases, duplicates and uncertain fields before approval.

### Stable internal structure

Supplier documents may vary, but SmartStock requires a standard internal model. Do not make every product field custom.

### Stock and order units are different

The model must be able to distinguish how an item is counted, how it is ordered, how many stock units are in an order unit and what quantity a supplier price covers.

### Current and desired stock are not supplier data

Supplier documents do not determine current physical stock or the amount a business wants to hold. Current quantities come from physical counts. Desired quantities are optional business-specific settings.

### Desired stock is optional

Desired stock control must be enabled or disabled per product. Recommended quantities are secondary and require a current physical count to be reliable when usage is not continuously recorded.

### Manual ordering remains primary

Users can always scan an item and enter the quantity they want. Recommendations must be optional and overridable.

### Stocktake is independent

The ordering workflow must not depend on frequent stocktakes. Businesses may stocktake only once or twice per year.

### Recent ordering information is core

When scanning or reviewing a product, show the last order date, quantity and PO reference. This helps prevent accidental duplicate ordering.

### Receiving is optional

Goods receipt may be recorded, but it is not compulsory in the initial product. SmartStock must not describe an order as outstanding or received without supporting data, block reordering because an old PO remains open, or require digital processing of every delivery.

### PO submission must not change physical stock

Ordering goods is not receiving goods. Creating or sending a PO must not add quantities to current physical stock.

### Rork credits are constrained

Every Rork prompt must maximise value. Avoid repeated broad audits, repeated context, isolated cosmetic work and unnecessary explanation. Where safe, combine narrow verification, implementation and validation in one prompt. Include a stop condition if a material assumption is wrong.

## Decisions still required

- Final business and multi-user tenancy design.
- Exact supplier and product schema.
- Whether PO prices and totals are required for the first real-business trial.
- Supported extraction method and service for PDF/image documents.
- How updated supplier lists match and update existing products.
- Whether current stock is shown outside formal stocktakes when it may be stale.
- Timing and design of optional receiving.
- Commercial pricing and trial structure.
