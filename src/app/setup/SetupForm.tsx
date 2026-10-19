"use client";

import { useActionState, useState } from "react";

import { IconPlus, IconTrash } from "@/components/Icons";
import { ACCOUNT_TYPES } from "@/lib/accounts";
import { completeSetup, type SetupState } from "./actions";

interface MemberRow {
  key: number;
  name: string;
}

interface AccountRow {
  key: number;
  name: string;
  type: string;
  balance: string;
}

export function SetupForm({ today }: { today: string }) {
  const [state, action, pending] = useActionState<SetupState, FormData>(completeSetup, {});
  const [members, setMembers] = useState<MemberRow[]>([
    { key: 1, name: "" },
    { key: 2, name: "" },
  ]);
  const [accounts, setAccounts] = useState<AccountRow[]>([
    { key: 1, name: "", type: "SAVINGS", balance: "" },
    { key: 2, name: "Cash", type: "CASH", balance: "" },
  ]);
  const [nextKey, setNextKey] = useState(10);
  // Controlled, because React resets a form's uncontrolled fields after every submission,
  // including one that comes back with an error.
  const [householdName, setHouseholdName] = useState("");
  const [email, setEmail] = useState("");

  const fresh = () => {
    setNextKey((k) => k + 1);
    return nextKey;
  };

  return (
    <form action={action} className="flex flex-col gap-6">
      <section className="card flex flex-col gap-4 p-5">
        <div>
          <h2 className="text-lg">Your household</h2>
          <p className="mt-1 text-sm" style={{ color: "var(--text-muted)" }}>
            There is one login. Whoever holds it manages everything.
          </p>
        </div>
        <div>
          <label className="label" htmlFor="householdName">
            Household name
          </label>
          <input
            id="householdName"
            name="householdName"
            className="input"
            placeholder="The Shah household"
            value={householdName}
            onChange={(e) => setHouseholdName(e.target.value)}
            required
            maxLength={60}
          />
        </div>
        <div className="grid gap-4 sm:grid-cols-3">
          <div>
            <label className="label" htmlFor="email">
              Login email
            </label>
            <input
              id="email"
              name="email"
              type="email"
              className="input"
              value={email}
              onChange={(e) => setEmail(e.target.value)}
              required
              autoComplete="username"
            />
          </div>
          <div>
            <label className="label" htmlFor="password">
              Password
            </label>
            <input
              id="password"
              name="password"
              type="password"
              className="input"
              placeholder="10+ characters"
              required
              minLength={10}
              autoComplete="new-password"
            />
          </div>
          <div>
            <label className="label" htmlFor="confirm">
              Confirm password
            </label>
            <input
              id="confirm"
              name="confirm"
              type="password"
              className="input"
              required
              autoComplete="new-password"
            />
          </div>
        </div>
      </section>

      <section className="card p-5">
        <h2 className="text-lg">Members</h2>
        <p className="mt-1 mb-4 text-sm" style={{ color: "var(--text-muted)" }}>
          The people in the household. They do not sign in; you tag entries and accounts with
          them so you can see whose money is whose. Anything not tagged is Shared.
        </p>
        <div className="flex flex-col gap-2">
          {members.map((m) => (
            <div key={m.key} className="flex gap-2">
              <input
                name="memberName"
                className="input"
                placeholder="Name"
                value={m.name}
                maxLength={40}
                onChange={(e) =>
                  setMembers((ms) => ms.map((x) => (x.key === m.key ? { ...x, name: e.target.value } : x)))
                }
              />
              <button
                type="button"
                className="btn btn-ghost btn-sm"
                aria-label="Remove member"
                onClick={() => setMembers((ms) => ms.filter((x) => x.key !== m.key))}
              >
                <IconTrash size={16} />
              </button>
            </div>
          ))}
        </div>
        <button
          type="button"
          className="btn btn-secondary btn-sm mt-3"
          onClick={() => setMembers((ms) => [...ms, { key: fresh(), name: "" }])}
        >
          <IconPlus size={15} />
          Add member
        </button>
      </section>

      <section className="card p-5">
        <h2 className="text-lg">Accounts</h2>
        <p className="mt-1 mb-4 text-sm" style={{ color: "var(--text-muted)" }}>
          Where your money is today. Start with the main ones; you can add investments, cards
          and loans later from the Accounts page. For a credit card or loan, enter the amount
          you owe.
        </p>

        <div className="mb-4 max-w-xs">
          <label className="label" htmlFor="startDate">
            Balances are as of
          </label>
          <input id="startDate" name="startDate" type="date" className="input" defaultValue={today} required />
        </div>

        <div className="flex flex-col gap-2">
          {accounts.map((a) => (
            <div
              key={a.key}
              className="grid grid-cols-1 gap-2 rounded-xl p-3 sm:grid-cols-[1.4fr_1fr_1fr_auto]"
              style={{ background: "var(--bg-sunken)" }}
            >
              <input
                name="accountName"
                className="input"
                placeholder="e.g. HDFC Savings"
                value={a.name}
                maxLength={60}
                onChange={(e) =>
                  setAccounts((as) => as.map((x) => (x.key === a.key ? { ...x, name: e.target.value } : x)))
                }
              />
              <select
                name="accountType"
                className="select"
                value={a.type}
                onChange={(e) =>
                  setAccounts((as) => as.map((x) => (x.key === a.key ? { ...x, type: e.target.value } : x)))
                }
              >
                {ACCOUNT_TYPES.map((t) => (
                  <option key={t.key} value={t.key}>
                    {t.label}
                  </option>
                ))}
              </select>
              <input
                name="accountBalance"
                className="input tnum"
                inputMode="decimal"
                placeholder="Balance ₹"
                value={a.balance}
                onChange={(e) =>
                  setAccounts((as) => as.map((x) => (x.key === a.key ? { ...x, balance: e.target.value } : x)))
                }
              />
              <button
                type="button"
                className="btn btn-ghost btn-sm justify-self-start"
                aria-label="Remove account"
                onClick={() => setAccounts((as) => as.filter((x) => x.key !== a.key))}
              >
                <IconTrash size={16} />
              </button>
            </div>
          ))}
        </div>
        <button
          type="button"
          className="btn btn-secondary btn-sm mt-3"
          onClick={() => setAccounts((as) => [...as, { key: fresh(), name: "", type: "SAVINGS", balance: "" }])}
        >
          <IconPlus size={15} />
          Add account
        </button>
      </section>

      {state.error && (
        <p
          className="rounded-xl px-4 py-3 text-sm"
          style={{ background: "var(--debit-soft)", color: "var(--debit)" }}
          role="alert"
        >
          {state.error}
        </p>
      )}

      <div className="flex items-center gap-3">
        <button className="btn btn-primary" type="submit" disabled={pending}>
          {pending ? "Setting up…" : "Create & sign in"}
        </button>
        <span className="text-xs" style={{ color: "var(--text-faint)" }}>
          A starter set of income and expense categories is added too.
        </span>
      </div>
    </form>
  );
}
