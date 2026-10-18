# FamilyFinance

One private place for a household's money: what is in each bank account, what the
investments are worth, what is owed on cards and loans, what comes in, and where it goes —
by category and by member.

There is **one login**. Whoever holds it manages everything. Members (you, your spouse,
anyone else) do not sign in; they are tags, so every entry and account can say whose it is.
An entry with no member is **Shared**.

## Running it

FamilyFinance needs a Postgres database. Supabase's or Neon's free tier is plenty.

Fill in `DATABASE_URL` and `DIRECT_URL` in `.env` (see `.env.example` for which connection
string goes where). `.env` already has freshly generated `AUTH_SECRET` and `CRON_SECRET`.

```bash
npm install
npx prisma db push     # creates the tables
npm run dev            # http://localhost:3000
```

The first visit opens the setup page: name the household, choose the login email and
password, add members, and add the main accounts with today's balances. A starter set of
Indian-household categories is added for you.

To look around with made-up data first, against a **separate, empty** database:

```bash
npm run seed:demo      # refuses to run if the database is already set up
```

Sign in as `demo@example.com` / `familyfinance`. That password is printed here, so never seed
the database you will use for real.

```bash
npm test               # checks on the balance engine and the guards around it
npm run check:env      # checks the connection strings and secrets before deploying
npm run build && npm start
```

## How it works

Every rupee lives in an **account**: bank, cash, wallet, FD, RD, mutual fund, stocks, PPF,
EPF, NPS, gold, credit card or loan. Each entry moves money:

| Entry | Effect | Counted as income/expense? |
|---|---|---|
| **Income** | adds to the account it lands in | yes |
| **Expense** | takes from the account it was paid from | yes |
| **Transfer** | takes from one account, adds to another | **no** |
| **Balance adjustment** | corrects a bank or cash balance to what the bank shows | no |

Transfers are the important one. A SIP (savings → mutual fund), booking an FD, an ATM
withdrawal (bank → cash) and paying a credit card bill (bank → card) are all transfers: the
household still has the money, it has just moved. Recording them as expenses is the most
common way home-finance numbers go wrong.

**Credit cards.** A purchase on the card is an expense paid *from the card*, so it is counted
in the month you spent it. Paying the bill is a transfer from the bank into the card, so the
same money is never counted twice.

**Investments.** Each investment shows two figures:

- **Put in**: the opening value plus every transfer in, less anything taken out.
- **Worth now**: the latest **Update value** you recorded (from a statement, the app or the
  CAS) plus anything added after that date. Before the first update it is the same as put in.

The gap is the gain. Loans work the same way: update the outstanding amount from the lender's
statement now and then.

**Net worth** = bank & cash + investments at current value − what is owed on cards and loans.

Money is stored as whole paise (64-bit integers), never floating point. Deleting an entry is a
soft delete: it stops counting everywhere but stays in the database.

### Time zone

All dates are worked out in India time (`Asia/Kolkata`), set in `src/instrumentation.ts` when
the server starts, because Vercel's servers run on UTC and would otherwise think it was still
yesterday until 5:30 am. Set `APP_TIMEZONE` to use another zone.

## What is in it

- **Dashboard**: net worth and its split, this month's income, spending and savings rate, the
  net-worth trend, 12 months of money in and out, spending by category and by member, recent
  entries.
- **Transactions**: every entry, with date windows, filters (kind, account, category, member),
  search, and Excel/CSV export of exactly what is on screen.
- **Accounts**: grouped balances; each account's page has its history with a running
  balance, Update value (investments, cards, loans) or Adjust balance (bank, cash), and editing.
- **Reports**: this month, last month, last 12 months, this or last financial year (April to
  March), or any dates. Totals, savings rate, by category and by member, investment gains,
  and export.
- **Members** and **Settings**: members, categories (archive rather than delete once used),
  household name, password, a full export, and a log of recent changes.

## Deploying (Vercel + Supabase)

1. **Supabase**: create a project in **ap-south-1 (Mumbai)**. Take the **transaction pooler**
   string (port 6543) for `DATABASE_URL`, adding `?pgbouncer=true&connection_limit=1`, and the
   **session pooler** string (port 5432) for `DIRECT_URL`. Use the session pooler rather than
   the "direct connection" host: that host is IPv6-only and `prisma db push` often cannot reach it.
2. From this machine, with those in `.env`: `npm run check:env`, then `npx prisma db push`.
3. In the Supabase SQL editor, run `prisma/supabase-lockdown.sql`. Supabase otherwise exposes
   every table, password hash included, through its public REST API. Check the Table Editor
   shows RLS on for all nine tables.
4. **Vercel**: import the project and set `DATABASE_URL`, `DIRECT_URL`, `AUTH_SECRET`,
   `CRON_SECRET` (use new random values for production, not the local ones) and
   `TRUST_PROXY_HEADER=true`. `vercel.json` already runs functions in Mumbai (`bom1`), next to
   the database, and schedules a daily `/api/cron` that keeps a free Supabase project from
   pausing.
5. Open the site, complete setup, and sign in.

**Backups** are the database provider's: check that point-in-time restore is actually on.
The export on the Settings page is a complete copy worth downloading now and then.

## Stack

Next.js 15 (App Router) · TypeScript · Prisma + Postgres · Tailwind v4 · `jose` sessions ·
`bcryptjs` · `exceljs`. Charts are hand-written SVG and HTML, with no charting library.
Session handling, the database-backed sign-in throttle, money handling and the deployment
setup are carried over from HisabBook.
