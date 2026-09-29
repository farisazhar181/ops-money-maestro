## Pending implementation
- [x] Resolve database function security warnings
- [x] Gate pending and deactivated accounts
- [x] Complete role assignment and deactivation UI
- [x] Wire atomic AP and AR payments
- [x] Complete job financial creation, editing, detail, audit, and attachments
- [x] Add reports and CSV exports
- [x] Refresh generated database types
- [x] Verify builds, roles, and workflows
- [x] Overhead and Investor pages: Owner and Finance create/edit/void (Owner decision)

## Correctness fixes (Sep 29)
- [x] Totals from database reports (summary, monthly, aging); voided rows excluded; Operations blocked
- [x] Overhead in Net Profit + P&L/CSV columns; overhead page with pay/void
- [x] Explicit cash-flow types; financing separate; free-form expense removed
- [x] Job closing rejects blank/zero actuals; null ≠ zero
- [x] Liabilities to Revenue Ratio; payment date rule; Jakarta dates
- [x] Finance edits master data; referenced records undeletable
- [x] Owner audit coverage; tests; lint + build
- [x] Statistics page (6/12/24M, DB views, tests)
- [x] Investor Transactions page

## Batch B — interface + validated writes (Sep 29)
- [x] Edit/void UI for jobs, AP, AR, cash-flow; voided rows muted with who/when/why; blocked voids list dependents
- [x] Overhead page edit + Owner access; Investor page with totals
- [x] All business writes through database functions; direct INSERT/UPDATE revoked; every write logged
- [x] Job history shows before/after (role-limited)
- [x] Close financials dialog uses Pipeline/Active/Closed
- [x] Tests (18 pass), build OK, lint: formatting-only issues
