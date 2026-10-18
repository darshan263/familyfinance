"use client";

import { useActionState, useState } from "react";

import { accountGroup } from "@/lib/accounts";
import { FORM_KINDS, KIND_LABELS, type FormKind } from "@/lib/txn";
import { saveTransaction, type SaveState } from "./actions";

export interface FormAccount {
  id: string;
  name: string;
  type: string;
  isActive: boolean;
}

export interface FormCategory {
  id: string;
  name: string;
  kind: string;
  isActive: boolean;
}

export interface FormMember {
  id: string;
  name: string;
  isActive: boolean;
}

export interface TxnInitial {
  id: string;
  kind: FormKind;
  amount: string;
  date: string;
  description: string;
  notes: string;
  accountId: string;
  toAccountId: string;
  categoryId: string;
  memberId: string;
}

const ACCOUNT_LABEL: Record<FormKind, string> = {
  EXPENSE: "Paid from",
  INCOME: "Received into",
  TRANSFER: "From account",
};

const HINT: Record<FormKind, string> = {
  EXPENSE: "Money spent. Paid by credit card? Pick the card here, and record the bill payment later as a transfer.",
  INCOME: "Money earned: salary, interest, dividends, refunds.",
  TRANSFER:
    "Money moved between your own accounts: SIPs, FD bookings, ATM withdrawals, credit card bill payments. Not counted as income or expense.",
};

/**
 * One form for every kind of entry. All fields are controlled: React resets uncontrolled
 * fields after each submission, including one that comes back with an error, and nobody
 * should have to retype an entry because a category was missing.
 */
export function TxnForm({
  initial,
  defaultKind,
  today,
  accounts,
  categories,
  members,
}: {
  initial?: TxnInitial;
  defaultKind: FormKind;
  today: string;
  accounts: FormAccount[];
  categories: FormCategory[];
  members: FormMember[];
}) {
  const [state, action, pending] = useActionState<SaveState, FormData>(saveTransaction, {});

  const firstLiquid = accounts.find((a) => a.isActive && accountGroup(a.type) === "LIQUID");
  const [kind, setKind] = useState<FormKind>(initial?.kind ?? defaultKind);
  const [amount, setAmount] = useState(initial?.amount ?? "");
  const [date, setDate] = useState(initial?.date ?? today);
  const [description, setDescription] = useState(initial?.description ?? "");
  const [notes, setNotes] = useState(initial?.notes ?? "");
  const [accountId, setAccountId] = useState(initial?.accountId ?? firstLiquid?.id ?? "");
  const [toAccountId, setToAccountId] = useState(initial?.toAccountId ?? "");
  const [categoryId, setCategoryId] = useState(initial?.categoryId ?? "");
  const [memberId, setMemberId] = useState(initial?.memberId ?? "");

  // Archived categories, inactive accounts and members stay selectable only when this entry
  // already uses them, so editing an old entry never silently changes it.
  const usable = <T extends { id: string; isActive: boolean }>(items: T[], current: string[]) =>
    items.filter((i) => i.isActive || current.includes(i.id));

  const kindCategories = usable(
    categories.filter((c) => c.kind === kind),
    [initial?.categoryId ?? ""],
  );
  const accountOptions = usable(accounts, [initial?.accountId ?? "", initial?.toAccountId ?? ""]);
  const memberOptions = usable(members, [initial?.memberId ?? ""]);

  function switchKind(next: FormKind) {
    setKind(next);
    if (!categories.some((c) => c.id === categoryId && c.kind === next)) setCategoryId("");
  }

  return (
    <form action={action} className="card flex flex-col gap-5 p-5">
      {initial && <input type="hidden" name="entryId" value={initial.id} />}
      <input type="hidden" name="kind" value={kind} />

      <div>
        <div className="seg" role="tablist" aria-label="Kind of entry">
          {FORM_KINDS.map((k) => (
            <button
              key={k}
              type="button"
              role="tab"
              aria-selected={kind === k}
              className="seg-item"
              data-active={kind === k}
              onClick={() => switchKind(k)}
            >
              {KIND_LABELS[k]}
            </button>
          ))}
        </div>
        <p className="mt-2 text-xs" style={{ color: "var(--text-faint)" }}>
          {HINT[kind]}
        </p>
      </div>

      <div className="grid gap-4 sm:grid-cols-2">
        <div>
          <label className="label" htmlFor="amount">
            Amount
          </label>
          <div className="relative">
            <span
              className="pointer-events-none absolute top-1/2 left-3 -translate-y-1/2 text-sm"
              style={{ color: "var(--text-faint)" }}
            >
              ₹
            </span>
            <input
              id="amount"
              name="amount"
              className="input tnum pl-7 text-lg font-semibold"
              inputMode="decimal"
              placeholder="0.00"
              value={amount}
              onChange={(e) => setAmount(e.target.value)}
              required
              autoFocus={!initial}
            />
          </div>
        </div>
        <div>
          <label className="label" htmlFor="date">
            Date
          </label>
          <input
            id="date"
            name="date"
            type="date"
            className="input"
            value={date}
            onChange={(e) => setDate(e.target.value)}
            required
          />
        </div>
      </div>

      <div>
        <label className="label" htmlFor="description">
          Description
        </label>
        <input
          id="description"
          name="description"
          className="input"
          placeholder={kind === "EXPENSE" ? "e.g. BigBasket order" : kind === "INCOME" ? "e.g. October salary" : "e.g. Monthly SIP"}
          value={description}
          onChange={(e) => setDescription(e.target.value)}
          maxLength={120}
          required
        />
      </div>

      <div className="grid gap-4 sm:grid-cols-2">
        <div>
          <label className="label" htmlFor="accountId">
            {ACCOUNT_LABEL[kind]}
          </label>
          <select
            id="accountId"
            name="accountId"
            className="select"
            value={accountId}
            onChange={(e) => setAccountId(e.target.value)}
            required
          >
            <option value="">Pick an account</option>
            {accountOptions.map((a) => (
              <option key={a.id} value={a.id}>
                {a.name}
              </option>
            ))}
          </select>
        </div>

        {kind === "TRANSFER" ? (
          <div>
            <label className="label" htmlFor="toAccountId">
              To account
            </label>
            <select
              id="toAccountId"
              name="toAccountId"
              className="select"
              value={toAccountId}
              onChange={(e) => setToAccountId(e.target.value)}
              required
            >
              <option value="">Pick an account</option>
              {accountOptions
                .filter((a) => a.id !== accountId)
                .map((a) => (
                  <option key={a.id} value={a.id}>
                    {a.name}
                  </option>
                ))}
            </select>
          </div>
        ) : (
          <div>
            <label className="label" htmlFor="categoryId">
              Category
            </label>
            <select
              id="categoryId"
              name="categoryId"
              className="select"
              value={categoryId}
              onChange={(e) => setCategoryId(e.target.value)}
              required
            >
              <option value="">Pick a category</option>
              {kindCategories.map((c) => (
                <option key={c.id} value={c.id}>
                  {c.name}
                </option>
              ))}
            </select>
          </div>
        )}
      </div>

      <div>
        <span className="label">Whose is this?</span>
        <div className="flex flex-wrap gap-2">
          {[{ id: "", name: "Shared" }, ...memberOptions].map((m) => {
            const on = memberId === m.id;
            return (
              <button
                key={m.id || "shared"}
                type="button"
                className="btn btn-sm"
                aria-pressed={on}
                onClick={() => setMemberId(m.id)}
                style={{
                  background: on ? "var(--accent-soft)" : "var(--bg-elevated)",
                  color: on ? "var(--accent)" : "var(--text-muted)",
                  borderColor: on ? "var(--accent)" : "var(--border-strong)",
                }}
              >
                {m.name}
              </button>
            );
          })}
        </div>
        <input type="hidden" name="memberId" value={memberId} />
      </div>

      <div>
        <label className="label" htmlFor="notes">
          Notes <span style={{ color: "var(--text-faint)" }}>(optional)</span>
        </label>
        <textarea
          id="notes"
          name="notes"
          className="textarea"
          value={notes}
          onChange={(e) => setNotes(e.target.value)}
          maxLength={1000}
        />
      </div>

      {state.error && (
        <p
          className="rounded-xl px-4 py-3 text-sm"
          style={{ background: "var(--debit-soft)", color: "var(--debit)" }}
          role="alert"
        >
          {state.error}
        </p>
      )}

      <div className="flex flex-wrap gap-2">
        <button className="btn btn-primary" type="submit" disabled={pending}>
          {pending ? "Saving…" : initial ? "Save changes" : "Save"}
        </button>
        {!initial && (
          <button className="btn btn-secondary" type="submit" name="another" value="1" disabled={pending}>
            Save &amp; add another
          </button>
        )}
      </div>
    </form>
  );
}
