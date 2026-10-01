# LokaFlow ERP

Create a multi-role Logistics & Financial Operations ERP web application for "PT. Loka Logistics Solution" using a Supabase backend and authentication.

Key Requirements:

1. Setup Role-Based Access Control (Admin, Finance, Operations) with email/password login and RLS.

2. Build the following core database tables:

   - customers (company name, contact, phone, email)

   - subcontractors_vendors (vendor name, service, contact)

   - jobs (job sheet no, customer_id, origin, destination, volume, selling_price, buying_price, status)

   - accounts_payable (job_id, vendor_id, item_cost, invoice_amount, TOP, due_date, paid_amount, balance)

   - accounts_receivable (invoice_no, job_id, customer_id, invoice_date, amount, TOP, due_date, paid_amount, balance, status)

   - payment_transactions (transaction_date, amount, type [AP/AR], payment_method)

3. Implement the exact 5-step operational workflow:

   - Create Job -> Log AP Vendor Costs -> Complete Job -> Issue AR Invoice -> Record Payments & Update Cash Flow.

4. Build an Executive Dashboard with KPI cards for:

   - Total Sales Revenue (Accrual)

   - Total Accounts Receivable (Accrual vs Actual Receipts)

   - Total Accounts Payable (Accrual vs Actual Payments)

   - Net Profit & Profitability Ratio

   - Debt-to-Asset / Liability Ratio

5. Use shadcn/ui components with a sleek sidebar navigation, responsive data tables, status badges, and overdue tracking.

This project was built with [Lovable](https://lovable.dev).

## Build with Lovable

Continue developing this project in the [Lovable editor](https://lovable.dev/projects/0bd8d420-77df-410a-82cf-7b024f5a782d).

- **Ship faster**: describe what you want to build and Lovable handles the code.
- **Stay in sync**: every change made in Lovable is committed straight to this repository.
- **Full ownership**: this code is yours. Push to `main` on GitHub and your changes sync back into Lovable, ready for your next prompt.

## Development

Prefer working locally? You need Node.js and npm — [install with nvm](https://github.com/nvm-sh/nvm#installing-and-updating).

```sh
git clone <this-repository-url>
cd <repository-name>
npm i
npm run dev
```
