# FlashPOS

FlashPOS is a production-oriented point-of-sale and store-operations application for Flash Express. It supports day-to-day selling, inventory control, purchasing, returns inspection, expenses, reporting, cashier closing, and administrative oversight in one authenticated system.

The project prioritizes correct financial and inventory records, least-privilege access, traceable business operations, and maintainable delivery over speculative complexity. See [`AGENTS.md`](AGENTS.md) for the canonical engineering, security, Git, testing, and review standards. `CLAUDE.md` imports that same guide for Claude-based coding agents.

## Current capabilities

### Sales and checkout

- Walk-in checkout with cash, GCash, or credit-card payment details
- Marketplace orders with channel, order-reference, and fulfillment tracking
- Product search, variant selection, cart management, discounts, and non-VAT tax handling
- Atomic checkout through PostgreSQL functions that create sales records and deduct stock
- Transaction history, transaction details, payment references, receipts, and audit records
- Full and partial refunds with inventory-restock controls

### Products and inventory

- Product families with structured variant attributes such as size and color
- Optional color swatches for variant values
- Product creation and editing, active/archive status, stock adjustments, and stock-movement history
- Low-stock indicators and notifications
- Separate supplies inventory for packaging and other operating consumables

### Purchasing and replenishment

- Supplier management and purchase-order creation, receipt, cancellation, and archive views
- Sequential purchase-order numbers and supplier-facing printable documents
- Product-variant snapshots on purchase-order items so historical documents remain understandable
- Smart reorder recommendations based on sales velocity, low-stock episodes, and configured thresholds
- Purchase-order editing and soft deletion while an order is still `ordered`; partially received orders are locked from those operations

### Operations and administration

- Return inspection kept separate from financial refunds: good items return to sellable stock, while damaged items enter the back-order ledger
- Private return-photo storage and an admin inspection workflow
- Expenses and categories
- Daily cashier closing with payment-method reconciliation
- Role-based team management, user activation, and audit activity
- Per-user notifications, including inventory and supplies alerts
- Authenticated downloadable user manual at `docs/FlashPOS-User-Manual.docx`

### Reporting

- Today, last 7 days, last 30 days, and monthly sales views
- Custom inclusive start/end date ranges using the `Asia/Manila` business timezone
- Revenue, order, item, expense, refund, payment-method, channel, and trend summaries
- Empty-state and invalid-date handling for custom ranges
- CSV exports for sales, inventory, expenses, purchases, cashier closings, and audit activity
- Custom-range sales exports restricted to the selected dates

## Recent updates

The latest repository work includes:

- Custom sales-report date ranges with shared server-side validation, Manila-to-UTC boundaries, filtered totals, empty states, and range-scoped CSV export; this is an application-only change with no Supabase migration
- Purchase-order editing and soft deletion for orders that have not started receiving, plus an archived-order view and audit details
- Smart reorder recommendations, store/supplier details, sequential PO numbers, and supplier-facing printable purchase orders
- Supplies tracking and inventory/supplies low-stock notifications
- Returns inspection, private photo evidence, and damaged-item back-order tracking
- Credit-card checkout and structured product variant families with optional color swatches

Use the Git history and pull requests for the full change record and design discussion.

## Technology and services

- [Next.js](https://nextjs.org/) 16 App Router with React 19 and Server Components
- TypeScript 5
- Tailwind CSS 4
- Supabase Auth, PostgreSQL, Row Level Security (RLS), Storage, Realtime, and RPC/database functions
- Railway deployment using Next.js standalone output
- ESLint 9 for static checks
- npm and `package-lock.json` for reproducible dependency installation

The exact supported versions are declared in `package.json` and locked in `package-lock.json`.

## Architecture

FlashPOS is a server-first Next.js application:

1. `src/app/` owns routes, layouts, page composition, loading/error states, Server Actions, and HTTP endpoints.
2. Small Client Components under `src/components/` own browser-only interaction such as modals, forms, search, and notifications.
3. `src/features/` contains cohesive feature-specific domain helpers as features are actively developed. Existing code is migrated there incrementally, not through broad file moves.
4. `src/lib/` contains shared server infrastructure and domain helpers, including Supabase clients, authentication, permissions, audit logging, money calculations, formatting, and reorder logic.
5. Supabase RLS is the final authorization boundary. Server Actions and Route Handlers also authenticate and authorize explicitly before performing sensitive work.
6. PostgreSQL functions protect transactional operations that require locks or invariant enforcement, including checkout, refunds, receiving, stock changes, and purchase-order mutations.

Persisted PostgreSQL `numeric` values are authoritative for money, tax, discounts, refunds, costs, and stock. Browser calculations are previews only. Application workflows should record inventory and audit corrections as new history rather than erase prior business events.

### Repository layout

```text
.
├── src/
│   ├── app/
│   │   ├── api/                  # Authenticated HTTP endpoints and CSV/manual downloads
│   │   ├── auth/                 # Authentication callback
│   │   ├── dashboard/            # POS and administrative routes
│   │   └── login/                # Sign-in flow
│   ├── components/               # Shared and route-supporting interactive components
│   ├── features/
│   │   └── reports/              # Report date-range domain logic
│   ├── lib/                       # Supabase, auth, permissions, audit, money, and domain helpers
│   ├── proxy.ts                   # Session refresh and route-level authentication gate
│   └── types/                     # Shared application types
├── supabase/
│   └── migrations/               # Immutable, ordered database migrations
├── docs/                          # User-facing manuals and future detailed documentation
├── scripts/                       # Standalone-build preparation and production start scripts
├── AGENTS.md                      # Canonical contributor and coding-agent engineering guide
├── CLAUDE.md                      # Claude-specific import of AGENTS.md
└── README.md                      # Product, setup, architecture, and current-state overview
```

The long-term direction is feature-oriented organization under `src/features/<feature>/`, while `src/app/` remains focused on routing and request boundaries. Do not move stable code merely to make the directory tree look uniform; migrate it when making a meaningful change to that feature.

## Roles and authorization

- Authenticated employees can use the operational workspace allowed by current RLS policies and server-side permission checks.
- Super administrators can access sensitive administration such as team access, returns inspection, expenses, settings, and broader financial views.
- A proxy or layout redirect is not treated as sufficient authorization. Every sensitive Server Action, Route Handler, storage operation, RPC, and table policy must enforce the intended role.
- Inactive users must not retain application access.

When changing permissions, review the complete path: UI visibility, server authorization, Supabase RLS, function grants, storage policies, audit behavior, and negative-path tests.

## Local setup

### Prerequisites

- Node.js `20.9+`
- npm
- Access to the authorized Supabase project, or a separate Supabase project for isolated development
- A valid FlashPOS user account

### 1. Clone and install

```bash
git clone <repository-url>
cd pos-flashexpress
npm ci
```

Open the project in VS Code from the repository directory with:

```bash
code .
```

If `code` is unavailable, install the VS Code shell command from the Command Palette with **Shell Command: Install 'code' command in PATH**, then open a new terminal.

### 2. Configure the environment

Create a local `.env.local` file. Obtain values through an approved secure channel; never copy credentials into tickets, chat, documentation, screenshots, commits, or pull requests.

```bash
NEXT_PUBLIC_SUPABASE_URL=
NEXT_PUBLIC_SUPABASE_PUBLISHABLE_KEY=
SUPABASE_SERVICE_ROLE_KEY=
```

| Variable | Required | Purpose |
| --- | --- | --- |
| `NEXT_PUBLIC_SUPABASE_URL` | Yes | URL of the selected Supabase project |
| `NEXT_PUBLIC_SUPABASE_PUBLISHABLE_KEY` | Yes | Browser-safe publishable/anon key; access is still constrained by RLS |
| `SUPABASE_SERVICE_ROLE_KEY` | For privileged admin operations | Server-only key used where an authenticated admin must bypass RLS, including account provisioning |

Never prefix a secret or service-role key with `NEXT_PUBLIC_`. Environment files are ignored by Git and must remain local. Do not read or print another developer's environment file while troubleshooting.

### 3. Prepare the database

The deployed application uses an existing hosted Supabase project. A new developer normally connects to an authorized environment and must not reset it or reapply migrations blindly.

For a new isolated Supabase project, run every SQL file in `supabase/migrations/` in filename order. The repository currently starts with:

```text
20260721000000_initial_pos.sql
```

and ends with:

```text
20260815000000_purchase_order_edit_delete.sql
```

The initial migration creates a profile automatically for each new Supabase Auth user. After creating the first account in **Authentication > Users**, promote that profile once with the UUID-based SQL statement documented at the end of the initial migration. Team & Access can provision additional accounts after the application has an active `super_admin`.

There is currently no committed Supabase CLI project configuration or automated migration deployment. Applying migrations to a hosted project is an explicit maintainer operation, currently performed in the Supabase SQL editor after reviewing the target schema and backup/rollback plan. Applied migrations are immutable: add a new timestamped migration for every later schema change.

After applying migrations, verify:

- tables, indexes, constraints, RLS policies, and storage policies were created;
- RPC execute grants are limited to the intended roles;
- the expected administrator can sign in;
- checkout, stock movement, and other affected business paths work with both allowed and denied users;
- the migration filename and result are recorded in the pull request or release handoff.

### 4. Start development

```bash
npm run dev
```

Open [http://localhost:3000](http://localhost:3000).

## Development workflow

Read `AGENTS.md` completely before changing code. The normal contribution flow is:

1. Confirm the task and business acceptance criteria.
2. Inspect the relevant routes, components, libraries, Supabase migrations, Git status, and recent commits.
3. For Next.js work, read the relevant Next.js 16 documentation under `node_modules/next/dist/docs/` before relying on framework behavior.
4. Start from current `main` and create one short-lived branch, such as `feat/123-short-description`, `fix/123-short-description`, or `docs/short-description`. Codex-managed branches use the `codex/` prefix.
5. Make the smallest complete change, preserving unrelated work and existing migrations.
6. Review the diff for secrets, authorization gaps, missing error handling, unsafe money or inventory calculations, and unrelated changes.
7. Run all available quality checks and focused behavioral scenarios.
8. Open a focused pull request with its design decisions, evidence, migration steps, operational risks, and screenshots for visible UI work.
9. Merge only after required checks pass and at least one reviewer approves business-critical changes.

Use Conventional Commits, for example:

```text
feat(reports): add custom sales date range
fix(inventory): prevent negative stock adjustment
docs(readme): update developer onboarding
```

Do not push, open or merge a pull request, run hosted migrations, or deploy unless that action is explicitly authorized.

## Running and verification

### Development server

```bash
npm run dev
```

### Lint

```bash
npm run lint
```

### Production build and local start

```bash
npm run build
npm start
```

`npm run build` performs the production compilation and TypeScript validation. Its `postbuild` step copies static assets, public files, and the authenticated user manual into Next.js standalone output. `npm start` serves that standalone build on `0.0.0.0`, which is suitable for Railway.

Every code change must pass `npm run lint` and `npm run build`. Also test the changed success, validation, authorization, database-failure, empty-state, and relevant mobile paths. Never report a check as passing unless it was actually run.

## Deployment

FlashPOS is deployed to Railway and connects to hosted Supabase. A deployment should follow this order:

1. Review and approve the pull request, including any database compatibility and rollback/forward-fix notes.
2. If the release has a new backward-compatible migration, obtain explicit authorization and apply it to the target Supabase project in the documented order.
3. Verify the migration directly in Supabase before releasing dependent application code.
4. Configure the required environment variables in Railway without exposing their values.
5. Build with `npm run build` and run the standalone application with `npm start`.
6. Perform a post-deployment smoke test covering sign-in, role restrictions, the affected workflow, and relevant financial or inventory totals.

Never reset the hosted database, modify production data, rotate credentials, or change the linked Supabase project as an incidental part of deployment.

## Important implementation decisions

- **Manila business dates:** Reports and other business-date rules use `Asia/Manila`. Date filters are converted to UTC boundaries for persisted `timestamptz` values. Custom report ranges include the entire selected end date.
- **Database-owned invariants:** Checkout, refunds, receiving, stock adjustments, and sensitive purchase-order changes use PostgreSQL functions when atomicity, locks, or multi-table invariants matter.
- **Append-oriented history:** Application workflows add stock movements and audit records for corrections. Purchase-order deletion is a soft cancellation with a reason, not physical deletion. A legacy stock-ledger policy exception is called out below.
- **Returns are not refunds:** A physical inspection can restore a good item to stock or record a damaged item in back orders without silently changing the financial refund record.
- **Historical purchase context:** Purchase-order line items retain product and variant snapshots so later product edits do not make old supplier documents ambiguous.
- **Server-first rendering:** Server Components and server-side data access are the default. Client Components are kept at the smallest interactive boundary.
- **Incremental feature organization:** New or substantially changed domain logic should move into a focused `src/features/<feature>/` module, while shared infrastructure remains in `src/lib/`.

## Security and data-integrity checklist

- Never expose `.env.local`, the service-role key, customer data, or database dumps.
- Keep privileged Supabase clients in server-only modules and use the service role only where bypassing RLS is required.
- Validate all form, JSON, route, search-parameter, date, quantity, enum, and monetary inputs on the server.
- Never ignore a Supabase error or present a failed mutation as successful.
- Do not weaken RLS to work around an application bug.
- Review authentication, payments, refunds, roles, exports, inventory corrections, return photos, and purchase receiving as high-risk areas.
- Keep return-photo storage private and issue access only through authorized server paths.
- Audit security-sensitive and business-significant actions without logging credentials or unnecessary personal data.

## Current limitations and engineering backlog

These are known constraints, not commitments to a particular product roadmap:

- The repository has no automated test suite or committed CI workflow yet. Lint, build, code review, and focused manual scenarios are the current safeguards.
- Supabase database types are still maintained by hand; generated schema types should be introduced before schema usage expands substantially.
- Several screens and CSV exports use bounded query limits rather than complete pagination or streamed export. CSV exports are currently capped at 10,000 fetched rows.
- Built-in sales-report presets retain their legacy export behavior; the new custom-range export is the range-scoped sales export.
- The application is network-dependent and has no offline transaction queue. Loss of connectivity should be treated as a failed operation, never an assumed successful sale.
- Hosted migrations are manual. A reviewed, non-destructive migration deployment workflow is a future infrastructure improvement.
- The initial schema still permits a `super_admin` to update or delete stock-ledger rows even though current engineering policy requires append-only corrections. Tightening that policy requires a separately reviewed migration and production compatibility check.
- `npm run lint` currently reports an existing Next.js advisory for a raw `<img>` in the return-inspection photo preview.
- Legacy generated `.artifacts/` content is tracked in the repository. Do not add new proof or generated artifacts; cleanup should be performed as a separate reviewed change.
- Production error monitoring, broader observability, automated backup verification, and recovery drills are recommended before higher-volume operation.

Near-term engineering priorities are to add critical-path database/integration coverage, introduce CI for lint/build/tests, generate Supabase types, paginate growing operational datasets, and add production error monitoring. Product features should be added only from approved business requirements rather than inferred from this list.

## Documentation map

- `README.md` — product scope, current capabilities, architecture, setup, database, deployment, and known limitations
- `AGENTS.md` — canonical coding, security, migration, Git, testing, review, and AI-agent rules
- `CLAUDE.md` — Claude-specific import of the canonical engineering guide
- `docs/FlashPOS-User-Manual.docx` — authenticated end-user operating manual

Update documentation in the same pull request whenever a change affects setup, commands, environment variables, architecture, roles, business workflows, migrations, deployment, known limitations, or user behavior.
