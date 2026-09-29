## Pending implementation
- [x] Resolve database function security warnings
- [x] Gate pending and deactivated accounts
- [x] Complete role assignment and deactivation UI
- [x] Wire atomic AP and AR payments
- [x] Complete job financial creation, editing, detail, audit, and attachments
- [x] Add reports and CSV exports
- [x] Refresh generated database types
- [x] Verify builds, roles, and workflows
- [ ] Make Overhead and Investor pages read-only for Owner and manageable by Finance

## Correctness fixes (Sep 29)
- [x] Totals from database reports (summary, monthly, aging); voided rows excluded; Operations blocked
- [x] Overhead in Net Profit + P&L/CSV columns; overhead page with pay/void
- [x] Explicit cash-flow types; financing separate; free-form expense removed
- [x] Job closing rejects blank/zero actuals; null ≠ zero
- [x] Liabilities to Revenue Ratio; payment date rule; Jakarta dates
- [x] Finance edits master data; referenced records undeletable
- [x] Owner audit coverage; tests; lint + build
- [ ] Statistics page (next batch)
- [ ] Investor Transactions page (next batch; database side ready)
