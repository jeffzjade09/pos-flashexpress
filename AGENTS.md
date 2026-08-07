# FlashPOS Engineering Guide

This file is the canonical engineering guide for human contributors and AI coding agents. `README.md` provides product and setup context; `CLAUDE.md` imports this guide. When instructions appear to conflict, follow the more specific repository rule and ask before taking an irreversible or production-impacting action.

## Mission and priorities

FlashPOS is a scalable, maintainable, production-ready business application for point-of-sale and store operations. Optimize decisions in this order:

1. Data integrity and correct financial or inventory results
2. Security, authorization, and protection of production data
3. Reliability, auditability, and recoverability
4. Maintainability and clarity for future contributors
5. Performance and scalability supported by evidence
6. Delivery speed without bypassing the safeguards above

Avoid speculative abstractions, broad rewrites, and new infrastructure without a demonstrated need. Prefer small, reviewable improvements that preserve behavior.

## Required context before changes

Before changing the project:

1. Read this file and `README.md` completely.
2. Inspect `package.json`, relevant source files, and all related Supabase migrations.
3. Run `git status` and inspect recent commits. Preserve unrelated user changes in a dirty worktree.
4. Trace the complete read or mutation path before editing it, including authorization, RLS, database functions, UI callers, audit records, and cache revalidation.
5. Identify whether the change requires a new migration or manual hosted-project action.

Do not read, print, expose, or commit `.env`, `.env.local`, credentials, tokens, production data, or service-role keys.

<!-- BEGIN:nextjs-agent-rules -->
# This is NOT the Next.js you know

This version has breaking changes — APIs, conventions, and file structure may all differ from your training data. Read the relevant guide in `node_modules/next/dist/docs/` before writing any code. Heed deprecation notices.
<!-- END:nextjs-agent-rules -->

## Architecture principles

- Use the Next.js App Router and Server Components by default. Add `"use client"` only at the smallest boundary that needs browser state, effects, or event handlers.
- Keep `src/app/` focused on routing, layouts, page composition, loading/error states, and HTTP boundaries.
- Place reusable, feature-specific code under `src/features/<feature>/` as features grow. A feature may contain `components/`, `actions.ts`, `queries.ts`, `schemas.ts`, and `types.ts`.
- Keep truly shared presentation primitives in `src/components/` and cross-feature infrastructure in `src/lib/`. Do not move existing files solely to match a target structure; migrate them when the feature is being meaningfully changed.
- Server Actions are application entry points, not the business-data layer. They must authorize, validate, call a typed operation, translate expected errors, and revalidate affected routes.
- Keep Supabase clients and server-only data access in explicitly server-safe modules. The service-role client must never enter a Client Component or browser bundle.
- RLS is the final authorization boundary, but every Server Action and Route Handler must also authenticate and authorize explicitly. Proxy or layout checks alone are insufficient.
- Use PostgreSQL functions for multi-table operations requiring transactions, row locks, or invariant enforcement. Use direct RLS-protected queries for straightforward reads and simple CRUD.
- PostgreSQL `numeric` values and database functions are authoritative for persisted money, discounts, taxes, refunds, and stock. Browser calculations are previews only.
- Preserve append-only stock and audit history. Corrections should create explicit records rather than erase business history.
- Use `Asia/Manila` for business-date rules unless a documented requirement changes the business timezone.

## Code organization and naming

- Use `kebab-case` for files and directories.
- Use `PascalCase` for React components, exported classes, and exported types.
- Use `camelCase` for functions, variables, hooks, and TypeScript object properties.
- Preserve `snake_case` at Supabase and PostgreSQL boundaries. Map to application naming when it improves clarity.
- Prefer named domain types over large repeated inline types. Use generated Supabase database types once available instead of hand-maintaining schema shapes.
- Keep modules cohesive. Split a component when it mixes substantial form state, domain calculations, modal behavior, and presentation.
- Extract shared code for a real shared concept, not merely to reduce line count. Avoid generic `utils` dumping grounds; use purpose-specific modules such as `money.ts`, `dates.ts`, or `errors.ts`.
- Keep imports explicit and use the `@/` alias for code under `src/`.
- Do not leave commented-out code, unexplained TODOs, debug logging, dead exports, or unrelated formatting changes.

## Validation and error handling

- Treat all `FormData`, JSON, route parameters, search parameters, and external values as untrusted.
- Validate on the server even when the UI validates the same field. Validate identifiers, enums, integer quantities, monetary ranges, dates, array shapes, and required text.
- Never ignore a Supabase `error`. A data operation must return a safe expected error or throw an unexpected operational error for an error boundary and monitoring.
- Do not expose raw database, authentication, or internal exception details to end users unless explicitly classified as safe.
- Use consistent action-state results and accessible success/error feedback. A failed mutation must never be presented as successful.
- Preserve atomicity. Do not replace a transactional database function with a sequence of independent client or server queries.
- Log security-sensitive or business-significant actions through the established audit mechanism without placing secrets or unnecessary personal data in logs.

## Supabase and migration rules

- Preserve every existing migration. Applied migrations are immutable and append-only.
- Add schema changes as a new UTC timestamped file under `supabase/migrations/` using a descriptive `snake_case` suffix.
- Make migrations safe for the exact existing schema state. Consider data backfills, constraints, indexes, RLS, grants, existing rows, and application deployment order.
- Set an explicit safe `search_path` on database functions and review `security definer` functions especially carefully.
- Revoke public execution and grant only the roles that require an RPC.
- Update generated database types and relevant documentation after schema changes.
- Never run a hosted migration, reset a database, modify production data, or change the linked Supabase project without explicit authorization.
- In the final handoff and pull request, name every new migration and explain exactly what a maintainer must run manually, in order, with verification steps.

## Security and privacy

- Never prefix a secret with `NEXT_PUBLIC_`.
- Keep `SUPABASE_SERVICE_ROLE_KEY` server-only and use the admin client only for operations that truly require bypassing RLS.
- Apply least privilege to database policies and application roles.
- Do not weaken RLS or authorization to work around an application bug.
- Do not commit environment files, browser profiles, generated session state, database dumps, customer data, or build/proof artifacts.
- Avoid placing sensitive values in command output, logs, screenshots, fixtures, issue descriptions, commits, or pull requests.
- Treat authentication, payments, refunds, roles, exports, and inventory corrections as high-risk areas requiring focused review and negative-path testing.

## Testing and quality gates

For every code change, run:

```bash
npm run lint
npm run build
```

The build includes TypeScript validation. Add or update focused tests for changed behavior when test infrastructure exists. Business-critical database behavior should be covered at the database or integration level, especially:

- Concurrent checkout and prevention of negative stock
- Discounts, taxes, rounding, and partial/full refunds
- Purchase receiving and cost updates
- Stock adjustments and append-only history
- Role permissions, inactive users, and RLS boundaries
- Cashier closing and report totals

Test success, validation failure, authorization failure, database failure, empty states, and relevant mobile behavior. Do not claim a check passed unless it was actually run. If a required check cannot run, report the exact reason and remaining risk.

## Git workflow

- Start from an up-to-date `main` and create a short-lived branch for one task.
- Use branch names such as `feat/123-short-description`, `fix/123-short-description`, `docs/short-description`, or `chore/short-description`. Automated Codex branches may use the required `codex/` prefix.
- Do not mix unrelated refactors, formatting, generated artifacts, or dependency updates into feature work.
- Rebase a private branch onto current `main` before final review. Coordinate before rewriting a shared branch and use `--force-with-lease`, never an unqualified force push.
- Do not commit directly to `main`. Do not push, open/merge a pull request, deploy, or publish unless the task explicitly authorizes that action.

## Commit conventions

Use Conventional Commits:

```text
feat(pos): add suspended orders
fix(refunds): preserve allocated tax rounding
docs(readme): clarify migration setup
test(checkout): cover concurrent stock deduction
chore(ci): add pull request checks
```

- Use an imperative, lowercase subject without a trailing period.
- Keep commits atomic and meaningful. Each commit should leave the repository in a coherent state.
- Include the application and migration portions of a change together when separating them would create an incompatible state.
- Explain non-obvious motivation, risks, or migration behavior in the commit body.
- Never commit secrets, local configuration, caches, browser state, production data, or unrelated generated files.

## Pull requests and review

A pull request should contain one coherent change and include:

- The problem, intended outcome, and scope
- Key design decisions and explicit out-of-scope work
- Screenshots or recordings for visible UI changes
- Commands and test scenarios run
- Migration filenames, manual deployment steps, compatibility notes, and verification
- Security, data-integrity, operational, and rollback/forward-fix considerations
- Documentation updated as part of the change

Open a draft early when design feedback would prevent rework. Keep the branch current, respond to every review comment, and do not resolve substantive feedback without addressing it or documenting the decision. At least one reviewer should approve business-critical changes, and all required checks must pass before merge. Prefer squash merging unless preserving separate commits provides lasting value.

Reviewers should prioritize correctness, authorization, data integrity, failure behavior, migration safety, and test coverage before style preferences.

## Contributor workflow

1. Confirm the task, acceptance criteria, and affected business rules.
2. Inspect current code, migrations, Git state, and relevant Next.js 16 documentation.
3. Create a focused branch and state any necessary assumptions.
4. Implement the smallest complete change while preserving existing behavior.
5. Review the diff for secrets, unrelated changes, missing error handling, and migration risk.
6. Run required checks and focused behavioral tests.
7. Update README, engineering documentation, and migration instructions when behavior or workflow changes.
8. Open a focused pull request, address feedback, and merge only after approval and green checks.
9. Run authorized migrations and deployments in the documented order, then verify the production outcome.

## Documentation ownership

- `README.md`: product purpose, capabilities, architecture summary, local setup, migrations, and contributor entry point.
- `AGENTS.md`: canonical engineering, coding, security, Git, testing, review, and agent guidance.
- `CLAUDE.md`: thin Claude-specific import of this guide; do not duplicate policies there.
- `docs/`: user manuals and future detailed architecture, database, operations, or ADR documents.

Update documentation in the same change when commands, environment variables, architecture, roles, business workflows, migrations, or deployment steps change.

## AI-agent operating rules

- Follow the same engineering and review standards as human collaborators.
- Preserve user-authored and unrelated changes. Never discard or overwrite work to simplify a task.
- Make reasonable, scoped assumptions, but stop for direction before irreversible, production-impacting, or materially broader actions.
- Explain every required manual migration or operational step in the final handoff.
- Do not push to GitHub, create or merge a PR, run hosted migrations, deploy, or alter external services unless explicitly requested.
- After changes, report files changed, checks run and their results, migrations required, and any known follow-up work.
