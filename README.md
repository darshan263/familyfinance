# FamilyFinance

One private place for a household's money: what is in each bank account, what the
investments are worth, what is owed on cards and loans, what comes in, and where it goes —
by category and by member.

There is **one login**. Whoever holds it manages everything. Members (you, your spouse,
anyone else) do not sign in; they are tags, so every entry and account can say whose it is.
An entry with no member is **Shared**.

## Running it

FamilyFinance needs a Postgres database. Supabase's or Neon's free tier is plenty.

Copy `.env.example` to `.env`, fill in `DATABASE_URL` and `DIRECT_URL` (the file says which
connection string goes where), and generate `AUTH_SECRET` and `CRON_SECRET` with the command
shown there. `.env` is never committed.

```bash
npm install
npx prisma db push     # creates the tables
set -a; . ./.env; set +a                                                  # DIRECT_URL into the shell
npx prisma db execute --url "$DIRECT_URL" --file prisma/constraints.sql   # database-level rules
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

**Start dates.** Each account is tracked from its start date, and its opening balance is the
balance on that day, so it already includes everything before it. An entry, value update or
adjustment dated earlier is refused, because it would be counted twice. To record older
entries, move the account's start date back and set the balance it had then.

Money is stored as whole paise (64-bit integers), never floating point; an amount with more
than two decimal places is refused rather than rounded. Deleting an entry is a soft delete: it
stops counting everywhere but stays in the database. The database itself also refuses rows
that break the rules above (an unknown kind, a transfer without a destination, a zero
amount), through the CHECK constraints in `prisma/constraints.sql`.

### Time zone

All dates are worked out in India time (`Asia/Kolkata`), set in `src/instrumentation.ts` when
the server starts, because Vercel's servers run on UTC and would otherwise think it was still
yesterday until 5:30 am. Set `APP_TIMEZONE` to use another zone.

## What is in it

- **Dashboard**: net worth and its split, this month's income, spending and savings rate, the
  net-worth trend, 12 months of money in and out, spending by category and by member, recent
  entries.
- **Transactions**: every entry, with date windows, filters (kind, account, category, member),
  search, and Excel/CSV export of the same window and filters (all matching entries, not just
  the first 500 the page shows; the Excel summary sheet covers the whole window).
- **Accounts**: bank, cash, cards and loans, grouped, with balances; each account's page has
  its history with a running balance, Adjust balance (bank, cash) or Update value (cards,
  loans), and editing.
- **Investments**: every holding with what went in, what it is worth and the gain, and the
  split by kind. Add one you **already hold** (what you have put in so far, and today's value
  if you know it; nothing is taken from any bank account), or one you are **buying now** (paid
  from a bank account). After that, each holding's page has Invest more and Withdraw, with
  the bank account preselected (the one the last investment came from), plus Update value.
- **Reports**: this month, last month, last 12 months, this or last financial year (April to
  March), all time, or any dates. Totals, savings rate, by category and by member, investment
  gains, and export.
- **Members** and **Settings**: members, categories (archive rather than delete once used),
  household name, password, signing out every other device, a full export, and a log of
  recent changes.

The login is shared, so **Sign out** only signs out the device you press it on. To cut off a
lost phone, use **Sign out all other devices** in Settings, or change the password.

## Deploying (Vercel + Supabase)

1. **Supabase**: create a project in **ap-south-1 (Mumbai)**. Take the **transaction pooler**
   string (port 6543) for `DATABASE_URL`, adding `?pgbouncer=true&connection_limit=1`, and the
   **session pooler** string (port 5432) for `DIRECT_URL`. Use the session pooler rather than
   the "direct connection" host: that host is IPv6-only and `prisma db push` often cannot reach it.
2. From this machine, with those in `.env`: `npm run check:env`, then `npx prisma db push`.
3. Run `prisma/supabase-lockdown.sql`, either in the Supabase SQL editor or with
   `npx prisma db execute --url "$DIRECT_URL" --file prisma/supabase-lockdown.sql`. Supabase
   otherwise exposes every table, password hash included, through its public REST API. Check
   the Table Editor shows RLS on for all nine tables. Then apply `prisma/constraints.sql` the
   same way.
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
