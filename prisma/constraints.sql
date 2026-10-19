-- Rules the database enforces itself, so a bad row cannot exist even if some code path that
-- writes one slips past the app's own checks. Prisma's schema language cannot express CHECK
-- constraints, so they live here and are applied by hand, the same way as the lockdown:
--
--   npx prisma db execute --url "$DIRECT_URL" --file prisma/constraints.sql
--
-- Safe to re-run: each constraint is dropped and re-added. `prisma db push` leaves CHECK
-- constraints alone, so pushing a schema change does not remove them.
--
-- The account types below must match ACCOUNT_TYPES in src/lib/accounts.ts; `npm test` checks
-- that they do. Adding a type means adding it in both places and re-running this file.

alter table public."Transaction" drop constraint if exists "Transaction_kind_check";
alter table public."Transaction" add constraint "Transaction_kind_check"
  check (kind in ('EXPENSE', 'INCOME', 'TRANSFER', 'ADJUSTMENT'));

-- A transfer, and only a transfer, has a destination, and it is a different account.
alter table public."Transaction" drop constraint if exists "Transaction_transfer_check";
alter table public."Transaction" add constraint "Transaction_transfer_check"
  check ((kind = 'TRANSFER') = ("toAccountId" is not null)
         and "toAccountId" is distinct from "accountId");

-- Transfers and adjustments never have a category. (Income and expense may lose theirs if a
-- category is ever deleted, which is why this is one-way.)
alter table public."Transaction" drop constraint if exists "Transaction_category_check";
alter table public."Transaction" add constraint "Transaction_category_check"
  check (kind in ('EXPENSE', 'INCOME') or "categoryId" is null);

-- Amounts are positive; only an adjustment carries a sign, and never zero.
alter table public."Transaction" drop constraint if exists "Transaction_amount_check";
alter table public."Transaction" add constraint "Transaction_amount_check"
  check ("amountCents" > 0 or (kind = 'ADJUSTMENT' and "amountCents" <> 0));

alter table public."Account" drop constraint if exists "Account_type_check";
alter table public."Account" add constraint "Account_type_check"
  check (type in ('SAVINGS', 'CURRENT', 'CASH', 'WALLET', 'FD', 'RD', 'MUTUAL_FUND', 'STOCKS',
                  'PPF', 'EPF', 'NPS', 'GOLD', 'OTHER_ASSET', 'CREDIT_CARD', 'LOAN'));

alter table public."Category" drop constraint if exists "Category_kind_check";
alter table public."Category" add constraint "Category_kind_check"
  check (kind in ('EXPENSE', 'INCOME'));
