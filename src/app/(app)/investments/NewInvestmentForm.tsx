"use client";

import { useActionState, useState } from "react";

import { ACCOUNT_TYPES } from "@/lib/accounts";
import { addInvestment, type FormState } from "./actions";

const TYPES = ACCOUNT_TYPES.filter((t) => t.group === "INVESTMENT");

function Rupee({ id, name, value, onChange, placeholder }: {
  id: string;
  name: string;
  value: string;
  onChange: (v: string) => void;
  placeholder?: string;
}) {
  return (
    <div className="relative">
      <span className="pointer-events-none absolute top-1/2 left-3 -translate-y-1/2 text-sm" style={{ color: "var(--text-faint)" }}>
        ₹
      </span>
      <input
        id={id}
        name={name}
        className="input tnum pl-7"
        inputMode="decimal"
        placeholder={placeholder ?? "0.00"}
        value={value}
        onChange={(e) => onChange(e.target.value)}
      />
    </div>
  );
}

/**
 * Add an investment. The first question decides everything after it: something already held
 * is recorded without touching any bank account; something bought now is paid for from one,
 * preselected to the account the last investment came from.
 */
export function NewInvestmentForm({
  members,
  bankAccounts,
  defaultFromId,
  today,
}: {
  members: { id: string; name: string }[];
  bankAccounts: { id: string; name: string }[];
  defaultFromId: string | null;
  today: string;
}) {
  const [state, action, pending] = useActionState<FormState, FormData>(addInvestment, {});
  const [mode, setMode] = useState<"existing" | "new">("existing");
  // Controlled throughout: React resets uncontrolled fields after a submission, errors included.
  const [name, setName] = useState("");
  const [type, setType] = useState("MUTUAL_FUND");
  const [institution, setInstitution] = useState("");
  const [owner, setOwner] = useState("");
  const [invested, setInvested] = useState("");
  const [current, setCurrent] = useState("");
  const [asOf, setAsOf] = useState(today);
  const [amount, setAmount] = useState("");
  const [date, setDate] = useState(today);
  const [fromId, setFromId] = useState(defaultFromId ?? "");
  const [notes, setNotes] = useState("");

  const choice = (value: "existing" | "new", title: string, body: string) => (
    <button
      type="button"
      onClick={() => setMode(value)}
      aria-pressed={mode === value}
      className="rounded-2xl border p-4 text-left transition-colors"
      style={{
        background: mode === value ? "var(--accent-soft)" : "var(--bg-elevated)",
        borderColor: mode === value ? "var(--accent)" : "var(--border-strong)",
      }}
    >
      <span className="block text-sm font-semibold" style={{ color: mode === value ? "var(--accent)" : "var(--text)" }}>
        {title}
      </span>
      <span className="mt-1 block text-xs" style={{ color: "var(--text-muted)" }}>
        {body}
      </span>
    </button>
  );

  return (
    <form action={action} className="card flex flex-col gap-5 p-5 sm:p-6">
      <input type="hidden" name="mode" value={mode} />

      <div className="grid gap-3 sm:grid-cols-2">
        {choice(
          "existing",
          "I already hold this",
          "Record what you have put in so far. Nothing is taken from any bank account.",
        )}
        {choice(
          "new",
          "I'm investing now",
          "Start a new investment. The amount is taken from the bank account you pick.",
        )}
      </div>

      <div className="grid gap-4 sm:grid-cols-2">
        <div>
          <label className="label" htmlFor="name">Name</label>
          <input id="name" name="name" className="input" placeholder="e.g. Parag Parikh Flexi Cap" value={name} onChange={(e) => setName(e.target.value)} maxLength={60} required />
        </div>
        <div>
          <label className="label" htmlFor="type">Kind</label>
          <select id="type" name="type" className="select" value={type} onChange={(e) => setType(e.target.value)}>
            {TYPES.map((t) => (
              <option key={t.key} value={t.key}>{t.label}</option>
            ))}
          </select>
        </div>
        <div>
          <label className="label" htmlFor="institution">
            Held with <span style={{ color: "var(--text-faint)" }}>(optional)</span>
          </label>
          <input id="institution" name="institution" className="input" placeholder="e.g. Zerodha, SBI, PPFAS" value={institution} onChange={(e) => setInstitution(e.target.value)} maxLength={60} />
        </div>
        <div>
          <label className="label" htmlFor="ownerMemberId">Belongs to</label>
          <select id="ownerMemberId" name="ownerMemberId" className="select" value={owner} onChange={(e) => setOwner(e.target.value)}>
            <option value="">Joint / household</option>
            {members.map((m) => (
              <option key={m.id} value={m.id}>{m.name}</option>
            ))}
          </select>
        </div>
      </div>

      {mode === "existing" ? (
        <div className="grid gap-4 rounded-2xl p-4 sm:grid-cols-3" style={{ background: "var(--bg-sunken)" }}>
          <div>
            <label className="label" htmlFor="invested">Invested so far</label>
            <Rupee id="invested" name="invested" value={invested} onChange={setInvested} />
          </div>
          <div>
            <label className="label" htmlFor="current">
              Worth today <span style={{ color: "var(--text-faint)" }}>(optional)</span>
            </label>
            <Rupee id="current" name="current" value={current} onChange={setCurrent} placeholder="from your statement" />
          </div>
          <div>
            <label className="label" htmlFor="asOf">As of</label>
            <input id="asOf" name="asOf" type="date" className="input" value={asOf} onChange={(e) => setAsOf(e.target.value)} required />
          </div>
          <p className="text-xs sm:col-span-3" style={{ color: "var(--text-muted)" }}>
            Tracking starts on this date. Future SIPs and top-ups are added from the investment&apos;s
            page and come out of a bank account.
          </p>
        </div>
      ) : (
        <div className="grid gap-4 rounded-2xl p-4 sm:grid-cols-3" style={{ background: "var(--bg-sunken)" }}>
          <div>
            <label className="label" htmlFor="amount">Amount</label>
            <Rupee id="amount" name="amount" value={amount} onChange={setAmount} />
          </div>
          <div>
            <label className="label" htmlFor="fromAccountId">Paid from</label>
            <select id="fromAccountId" name="fromAccountId" className="select" value={fromId} onChange={(e) => setFromId(e.target.value)} required>
              <option value="">Pick an account</option>
              {bankAccounts.map((a) => (
                <option key={a.id} value={a.id}>{a.name}</option>
              ))}
            </select>
          </div>
          <div>
            <label className="label" htmlFor="date">On</label>
            <input id="date" name="date" type="date" className="input" value={date} onChange={(e) => setDate(e.target.value)} required />
          </div>
          <p className="text-xs sm:col-span-3" style={{ color: "var(--text-muted)" }}>
            Recorded as money moved from the bank into the investment, so it is not counted as
            spending and your net worth stays the same.
          </p>
        </div>
      )}

      <div>
        <label className="label" htmlFor="notes">
          Notes <span style={{ color: "var(--text-faint)" }}>(optional)</span>
        </label>
        <textarea id="notes" name="notes" className="textarea" placeholder="Folio number, maturity date, nominee…" value={notes} onChange={(e) => setNotes(e.target.value)} maxLength={1000} />
      </div>

      {state.error && (
        <p className="rounded-xl px-4 py-3 text-sm" style={{ background: "var(--debit-soft)", color: "var(--debit)" }} role="alert">
          {state.error}
        </p>
      )}

      <div>
        <button className="btn btn-primary" type="submit" disabled={pending}>
          {pending ? "Saving…" : mode === "existing" ? "Add investment" : "Invest"}
        </button>
      </div>
    </form>
  );
}
