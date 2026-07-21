# FlashPOS

A Next.js and Supabase point-of-sale foundation for products sold by piece, pack, or box.

## Included in this foundation

- Supabase email/password authentication
- `employee` and `super_admin` access levels
- Protected dashboard routes and server-side authorization
- Super-admin team account creation, activation, and role management
- Product, packaging unit, sales, and append-only stock ledger schema
- PostgreSQL Row Level Security policies
- Dashboard and inventory views ready for live Supabase data

## Local setup

1. Use Node.js 20.19+ or Node.js 22.13+.
2. Create a Supabase project.
3. Run `supabase/migrations/20260721000000_initial_pos.sql` in the Supabase SQL Editor.
4. Run `supabase/migrations/20260721010000_create_inventory_product.sql` in the Supabase SQL Editor.
5. Run `supabase/migrations/20260721020000_adjust_inventory_stock.sql` in the Supabase SQL Editor.
6. Run `supabase/migrations/20260721030000_audit_logs_and_product_archive.sql` in the Supabase SQL Editor.
7. Run `supabase/migrations/20260721040000_marketplace_pos.sql` in the Supabase SQL Editor.
8. Run `supabase/migrations/20260721050000_walk_in_pos.sql` in the Supabase SQL Editor.
9. Run `supabase/migrations/20260721060000_gcash_payments.sql` in the Supabase SQL Editor.
10. Run `supabase/migrations/20260721070000_refunds_expenses_profit.sql` in the Supabase SQL Editor.
11. Run `supabase/migrations/20260721080000_purchases_closing_fulfillment.sql` in the Supabase SQL Editor.
12. Copy `.env.example` to `.env.local` and enter the project URL, publishable key, and server-only service-role key.
13. In Supabase Authentication, create the first user.
14. In the SQL Editor, promote that first user:

   ```sql
   update public.profiles
   set role = 'super_admin'
   where id = '<AUTH_USER_UUID>';
   ```

15. Run the app:

   ```bash
   npm run dev
   ```

Open `http://localhost:3000` and sign in. Further employee accounts are created from **Team & access** by the super admin; public signup is intentionally unavailable.

## Security notes

- Keep `SUPABASE_SERVICE_ROLE_KEY` server-only and never prefix it with `NEXT_PUBLIC_`.
- UI route guards improve navigation, while PostgreSQL RLS remains the final data-access boundary.
- Employees can append stock movements but cannot delete them. Super admins can make controlled corrections.
