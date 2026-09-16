# Strengthen job costing, access, and traceability

## What will change

### 1. Secure account approval and offboarding
- Rename the existing **Admin** role to **Owner** throughout the database and interface.
- New sign-ups will create a profile but receive no role and no data access.
- Add a dedicated waiting screen for pending users; all business pages remain blocked until activation.
- Upgrade **Users & Roles** so:
  - Owner can assign Owner, Finance, or Operations.
  - Finance can activate pending users as Finance or Operations only.
  - Owner and Finance can deactivate users immediately, while preserving their history.
  - Users cannot deactivate themselves.
- Enforce pending/deactivated status in database access rules, not only in the interface.

### 2. Protect job financial fields at the database level
- Move estimated selling, actual selling, estimated buying, actual buying, margin, and margin percentage out of the `jobs` table into a finance-only record.
- Operations queries will receive only operational job fields; sensitive financial columns will not exist in raw `jobs` responses.
- Owner and Finance can read and edit financial values through finance-protected access rules.
- Preserve existing selling and estimated buying values during the move.

> Technical note: row-level rules cannot hide individual columns. Separating financial fields is required to guarantee they never appear in an Operations API response.

### 3. Make payments atomic and explicit
- Add dedicated AP payment and AR payment records with date and amount.
- Put **Record payment** on every unpaid AP cost row and AR invoice row, including the job detail view.
- Validate positive amounts and prevent overpayment.
- Record payment, recalculate Paid/Balance/status, update overdue display, write the cash-flow entry, and add audit history as one database transaction.
- Refresh affected rows and summaries immediately without reloading the page.

### 4. Complete job detail and editing
- Make the whole Jobs table row open its detail page.
- Expand job detail to show all operational fields, linked AP costs, linked AR invoice, attachments, activity history, and Estimated vs Actual Selling/Buying/Margin side by side for authorized roles.
- Add job editing:
  - Operations may update cargo, service, customer, date, and route fields before closing.
  - Finance and Owner may set actual selling/buying and closing status.
  - Database functions enforce permitted fields so callers cannot bypass the interface.

### 5. Add audit history
- Create `activity_log` with actor, action, entity type, entity ID, timestamp, job link, and short description.
- Automatically log job, AP cost, AR invoice, AP/AR payment creation and edits, plus role assignment and deactivation.
- Show job-specific history on the detail page and a Finance/Owner activity page.

### 6. Add private attachments
- Create a private attachments area with one file path on each AP cost and AR invoice.
- AP accepts a vendor invoice PDF or image.
- AR accepts one invoice or BAST PDF/image attachment for v1.1.
- Use signed download links and database/storage rules so only active authorized staff can access files.

### 7. Add Reports and CSV exports
- Add a Finance/Owner Reports page with:
  - Monthly P&L
  - AR aging
  - AP aging
- Add CSV export to each view using the currently displayed data and filters.
- Keep tax fields, multi-currency, and formal financial statements deferred.

## Verification
- Test pending, Operations, Finance, Owner, and deactivated access against direct database queries and page navigation.
- Confirm Operations cannot retrieve any job financial fields from the raw jobs response.
- Test AP and AR partial/full payments, overpayment rejection, instant balance/status refresh, cash-flow linkage, and audit entries.
- Test job edits by role, attachments, detail-page links, activity history, and all three CSV downloads.
- Check desktop and mobile layouts, preview errors, and database security checks.
