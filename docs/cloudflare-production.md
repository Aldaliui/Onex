# ONEX Cloudflare production setup

## Completed

The Cloudflare account contains the `onex-production` D1 database (`72195b2f-df9e-49b0-81f5-cbf31daa829f`) in the EU jurisdiction, and the `onex-workbench` Worker has an `ONEX_DB` binding. The initial D1 schema and control data were applied idempotently and recorded in `_onex_migration_log`.

The Worker exposes `GET /__health`, which queries D1 and returns the initialized table list. It also applies baseline security headers to proxied Workbench responses.

## Reproducible deployment

From the repository root:

```bash
npx wrangler d1 migrations apply onex-production --remote --config cloudflare/wrangler.jsonc
npx wrangler deploy --config cloudflare/wrangler.jsonc
```

The Worker preview URL is `https://onex-workbench.raghabatstore.workers.dev/` and the health URL is `/__health`.

## Direct D1 API

The Worker now exposes a direct D1-backed REST API without forwarding ERP API requests to the Node origin:

```text
GET  /api/erp/master-data
GET  /api/erp/customers?search=...
GET  /api/erp/items?search=...&warehouseId=1
GET  /api/erp/invoices?search=...
GET  /api/erp/invoices/:id
POST /api/erp/invoices
PATCH /api/erp/invoices/:id
POST /api/erp/invoices/:id/post
POST /api/erp/invoices/:id/reverse
POST /api/erp/purchases
POST /api/erp/vouchers
POST /api/erp/inventory/receive
```

Sales invoices, purchase invoices, and payment vouchers accept `currencyCode` and `exchangeRate`. Invoice retrieval returns its lines and local-currency total; draft invoices can be edited with `PATCH`, while posted invoices are immutable. Item search is intended for the invoice line picker and supports code/name/description search, available quantity for a selected warehouse, and default sale price. New payment vouchers start as `DRAFT` so approval can be added as a controlled workflow.

Read routes are public catalog/data reads. Write routes require `Authorization: Bearer <ONEX_API_TOKEN>`. Configure the secret without committing it:

```bash
npx wrangler secret put ONEX_API_TOKEN --config cloudflare/wrangler.jsonc
npx wrangler d1 migrations apply onex-production --remote --config cloudflare/wrangler.jsonc
npx wrangler deploy --config cloudflare/wrangler.jsonc
```

The direct D1 API is intentionally separate from the existing Node/tRPC API during migration. The existing Node server still uses `drizzle-orm/mysql2`; clients must be migrated route-by-route to `/api/erp/*` before the Node API is retired.

Migration `0005_chart_of_accounts.sql` imports the Arabic simplified chart of accounts into `accounts` using `INSERT OR IGNORE`. It is safe to apply more than once and preserves the existing base accounts.

No custom Cloudflare Zone is currently present in the account. A custom domain can be added after a Zone is attached and DNS is delegated to Cloudflare.
