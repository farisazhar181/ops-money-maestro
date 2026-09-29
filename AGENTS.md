<!-- LOVABLE:BEGIN -->
> [!IMPORTANT]
> This project is connected to [Lovable](https://lovable.dev). Avoid rewriting
> published git history — force pushing, or rebasing/amending/squashing commits
> that are already pushed — as it rewrites history on Lovable's side and the
> user will likely lose their project history.
>
> Commits you push to the connected branch sync back to Lovable and show up in
> the editor, so keep the branch in a working state.
<!-- LOVABLE:END -->
- Financial totals come only from `report_summary`/`report_monthly`/`report_aging` database functions; never sum in the browser. Why: one definition shared by Dashboard, Reports and Statistics.
- Cash-flow rows are created only by payment functions (AP, AR, `pay_overhead`); clients cannot insert them. Why: prevents a cost being counted twice.
- Business dates use Asia/Jakarta via `today()`/`jakartaDate()` in `src/lib/format.ts` and `private.jkt_today()` in SQL. Why: due dates and months must not shift at UTC midnight.
- Tests: `bunx vitest run`; database tests need TEST_OWNER_TOKEN, TEST_FINANCE_EMAIL, TEST_OPS_EMAIL, TEST_PASSWORD and otherwise skip.
