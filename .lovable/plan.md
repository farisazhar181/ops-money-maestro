# Auditable finance corrections, statistics, and capital tracking

## Goal
Extend the existing ERP without rebuilding working workflows. Corrections will remain traceable, operating profit will include overhead, investor financing will remain separate, and job stages will use consistent names.

## Confirmed decisions
- Voiding is blocked while active dependencies remain: payments must be voided before their AP/AR parent; AP/AR entries must be cleared before a job can be voided.
- Job stages are exactly **Pipeline**, **Active**, and **Closed**. Voiding is separate from lifecycle status.
- AP/AR totals may be corrected only when the new total is at least the amount already paid; balances and payment status recalculate immediately.
- Overhead and Investor Transactions get separate sidebar pages.

## Implementation

### 1. Auditable edit and void foundation
- Add immutable void metadata to jobs, AP costs, AR invoices, payment records, and cash-flow transactions: voided status, reason, actor, and timestamp.
- Extend activity history with structured before/after values so edits and voids show what changed, who changed it, and when.
- Replace direct financial updates and hard deletes with validated database actions. Remove hard-delete access for these business records.
- Add guarded actions for:
  - Job operational edits and job voiding.
  - AP vendor/description/amount/terms/date edits and voiding.
  - AR invoice/customer/amount/terms/date edits and voiding.
  - Cash-flow date/amount/method/note edits and voiding.
- Keep linked AP/AR payment records synchronized when a generated cash-flow transaction is corrected or voided. Reject corrections that exceed the parent balance rules.
- Keep voided rows visible, visually muted, and marked **Voided** with actor, timestamp, and reason. Remove further payment/edit actions where they no longer apply.

### 2. Job stages and estimated-versus-actual values
- Migrate job stages from Draft / In Progress / Completed / Cancelled to Pipeline / Active / Closed, mapping existing records safely.
- Group the Job Sheets page into separate status sections whose headings and row badges always match.
- Preserve estimated selling and buying at creation and actual selling and buying at closing as distinct values.
- Treat actual values as unset until close. Dashboard, Statistics, and Monthly P&L use actuals for Closed jobs and estimates only for Pipeline/Active jobs.
- Update filters, dialogs, badges, summaries, audit descriptions, and tests to the new status vocabulary.

### 3. Overhead and investor entries
- Add an **Overhead Costs** table and page with month/date, Fixed or Variable type, amount, note, audit fields, edit, and void.
- Add an **Investor Transactions** table and page with Loan In or Repayment type, amount, date, note, audit fields, edit, and void.
- Restrict both areas to active Owner/Finance users through database policies.
- Subtract non-void overhead from Dashboard Net Profit and Monthly P&L for the matching month.
- Keep investor transactions outside revenue, job cost, operating profit, margin, AR, and AP calculations; show their financing totals only on their dedicated page.

### 4. Statistics page
- Add a dedicated **Statistics** sidebar page for Owner/Finance with a 6 / 12 / 24 month selector, defaulting to trailing 12 months.
- Add responsive charts for revenue trend, margin percentage, cash in versus cash out, liabilities versus receivables, AR aging, AP aging, top five customers by revenue, top five vendors by cost, and job volume.
- Exclude voided records consistently and use the corrected estimated/actual rules.

### 5. Dashboard, Reports, and ratio correction
- Rename the misleading card to **Liabilities to Revenue Ratio** and calculate outstanding liabilities divided by recognized revenue.
- Change **Net Profit (Pre-Overhead)** to **Net Profit**, subtracting overhead.
- Update Monthly P&L and CSV export with overhead and post-overhead net profit columns.
- Ensure all dashboard, report, aging, cash-flow, and statistics calculations exclude voided entries.

### 6. Regression and security verification
- Confirm new sign-ups receive a pending profile and no role, with all data pages blocked until assignment.
- Confirm Finance sees only Finance and Operations choices for pending users, and add database protection preventing Finance from changing an existing Owner.
- Confirm Operations cannot query job financial fields because they remain isolated in the protected financial table; verify this through an authenticated API-level test, not only UI visibility.
- Run role tests plus a fresh end-to-end correction/void workflow, verify dependency blocking, audit entries, overhead-adjusted P&L, investor exclusion, statistics ranges, and desktop/mobile rendering.
- Run the database linter and confirm the app build is clean.

## Technical notes
- Use migrations with explicit grants, row-level policies, and validated RPC wrappers for all new tables and mutations.
- Preserve existing payment history; voiding uses status/reversal semantics rather than deletion.
- Use the existing chart library and design tokens; no new visual system or unrelated features.
