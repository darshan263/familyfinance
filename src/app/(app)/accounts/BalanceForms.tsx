"use client";

import { useActionState, useState } from "react";

import { addValuation, adjustBalance, type FormState } from "./actions";

function ErrorLine({ error }: { error?: string }) {
  if (!error) return null;
  return (
    <p className="text-sm sm:col-span-3" style={{ color: "var(--debit)" }} role="alert">
      {error}
    </p>
  );
}

/** "What is it worth now?" for an investment, or "what is owed now?" for a card or loan. */
export function ValuationForm({
  accountId,
  today,
  owed,
}: {
  accountId: string;
  today: string;
  owed: boolean;
}) {
  const [state, action, pending] = useActionState<FormState, FormData>(addValuation, {});
  const [date, setDate] = useState(today);
  const [value, setValue] = useState("");
  const [note, setNote] = useState("");

  return (
    <form action={action} className="grid gap-3 sm:grid-cols-3">
      <input type="hidden" name="accountId" value={accountId} />
      <div>
        <label className="label" htmlFor="v-date">
          As of
        </label>
        <input id="v-date" name="date" type="date" className="input" value={date} onChange={(e) => setDate(e.target.value)} required />
      </div>
      <div>
        <label className="label" htmlFor="v-value">
          {owed ? "Outstanding amount" : "Current value"}
        </label>
        <input
          id="v-value"
          name="value"
          className="input tnum"
          inputMode="decimal"
          placeholder="₹"
          value={value}
          onChange={(e) => setValue(e.target.value)}
          required
        />
      </div>
      <div>
        <label className="label" htmlFor="v-note">
          Note <span style={{ color: "var(--text-faint)" }}>(optional)</span>
        </label>
        <input
          id="v-note"
          name="note"
          className="input"
          placeholder="e.g. from CAS statement"
          value={note}
          onChange={(e) => setNote(e.target.value)}
          maxLength={200}
        />
      </div>
      <ErrorLine error={state.error} />
      <div className="sm:col-span-3">
        <button className="btn btn-primary btn-sm" type="submit" disabled={pending}>
          {pending ? "Saving…" : "Update value"}
        </button>
      </div>
    </form>
  );
}

/** Set a bank or cash balance to what the bank says, posting the difference. */
export function AdjustForm({ accountId, today }: { accountId: string; today: string }) {
  const [state, action, pending] = useActionState<FormState, FormData>(adjustBalance, {});
  const [date, setDate] = useState(today);
  const [balance, setBalance] = useState("");

  return (
    <form action={action} className="grid gap-3 sm:grid-cols-3">
      <input type="hidden" name="accountId" value={accountId} />
      <div>
        <label className="label" htmlFor="a-date">
          On
        </label>
        <input id="a-date" name="date" type="date" className="input" value={date} onChange={(e) => setDate(e.target.value)} required />
      </div>
      <div>
        <label className="label" htmlFor="a-balance">
          Actual balance
        </label>
        <input
          id="a-balance"
          name="balance"
          className="input tnum"
          inputMode="decimal"
          placeholder="₹ as the bank shows it"
          value={balance}
          onChange={(e) => setBalance(e.target.value)}
          required
        />
      </div>
      <div className="flex items-end">
        <button className="btn btn-primary btn-sm" type="submit" disabled={pending}>
          {pending ? "Saving…" : "Adjust balance"}
        </button>
      </div>
      <ErrorLine error={state.error} />
    </form>
  );
}
