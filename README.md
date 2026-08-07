# FlashPOS

FlashPOS is a production-oriented point-of-sale and store-operations application built with Next.js 16, Supabase, and Railway. It is designed for products sold by piece, pack, or box and prioritizes reliable transactions, inventory accuracy, auditability, security, and maintainable growth.

## Current capabilities

- Supabase email/password authentication with `employee` and `super_admin` roles
- Walk-in cash and GCash checkout
- TikTok, Lazada, and Shopee order capture and fulfillment tracking
- Product variants, packaging units, stock adjustments, and low-stock monitoring
- Append-only stock movements and user activity logs
- Purchase orders, suppliers, and inventory receiving
- Order discounts, non-VAT percentage tax, item-level refunds, and restocking
- Expenses, profit reports, CSV exports, and cashier daily closing
- Protected dashboard routes, server-side authorization, and PostgreSQL Row Level Security

## Architecture

FlashPOS uses the Next.js App Router. Server Components perform authenticated reads, Client Components are limited to interactive UI, and Server Actions handle mutations. Supabase provides authentication and PostgreSQL persistence, while RLS remains the final data-access boundary.

Operations that must update multiple records atomically—such as checkout, refunds, stock adjustments, and purchase receiving—are implemented as PostgreSQL functions in versioned migrations. PostgreSQL is authoritative for persisted monetary totals and stock quantities; client-side calculations are previews only.

Application source lives under `src/`, database migrations under `supabase/migrations/`, deployment helpers under `scripts/`, and user-facing documentation under `docs/`. The canonical engineering, coding, Git, review, and AI-agent rules are in [AGENTS.md](./AGENTS.md).

## Local development

### Prerequisites

- Node.js 20.19+ or Node.js 22.13+
- npm
- Access to the existing hosted Supabase project, or a separate Supabase project for isolated development

### Environment

Create `.env.local` locally with values supplied through the approved secret-sharing process:

```text
NEXT_PUBLIC_SUPABASE_URL=
NEXT_PUBLIC_SUPABASE_PUBLISHABLE_KEY=
SUPABASE_SERVICE_ROLE_KEY=
```

Never commit `.env`, `.env.local`, service-role keys, database credentials, or production data. Only variables intentionally safe for browsers may use the `NEXT_PUBLIC_` prefix.

### Install and run

```bash
npm ci
npm run dev
```

Open `http://localhost:3000` and sign in. Public signup is intentionally unavailable; a super admin creates additional accounts from **Team & access**.

### Required checks

Run both checks before requesting review:

```bash
npm run lint
npm run build
```

The production build includes TypeScript validation. Add or update focused tests when changing behavior covered by the project's test infrastructure.

## Database setup and migrations

The application is already connected to an existing hosted Supabase project. Do not create, reset, link, or migrate a hosted project unless the task explicitly requires it and the project owner approves the target.

For a new isolated database, run every SQL file in `supabase/migrations/` in filename order. The current sequence ends with:

```text
20260723010000_order_discounts.sql
```

After creating the first authentication user in a new project, promote that user once:

```sql
update public.profiles
set role = 'super_admin'
where id = '<AUTH_USER_UUID>';
```

Treat migrations as append-only once applied. Never modify, reorder, or delete existing migrations to change a deployed schema; add a new timestamped migration instead. Every database-changing pull request must document the migration to run, deployment order, compatibility considerations, verification steps, and any required forward-fix plan.

## Contributing

Before starting work, read [AGENTS.md](./AGENTS.md) completely. It is the shared source of truth for human collaborators and AI coding agents and covers:

- Project structure and separation of concerns
- Coding, naming, security, and data-integrity standards
- Branch and Conventional Commit conventions
- Pull request, testing, and review expectations
- Supabase migration and deployment safety

Keep changes focused and preserve existing behavior unless the task explicitly changes it. Do not push directly to `main`; changes should be reviewed and pass the required checks before merge.

## Deployment

Railway runs the Next.js standalone output through the scripts in `scripts/`. Deployment configuration, environment variables, hosted migrations, and production releases are controlled operations. Do not deploy or push changes unless explicitly authorized.
