"use client";

import { useActionState, useState } from "react";

import { moveInvestmentMoney, type FormState } from "./actions";

/**
 * Invest more (a SIP or a top-up) or withdraw. The bank account is preselected: for investing,
 * the one the last investment was paid from; for withdrawing, the same, since that is usually
 * where redemptions land too. Either can be changed.
 */
export function MoveMoneyForm({
  investmentId,
  bankAccounts,
  defaultBankId,
  today,
  canInvest,
}: {
  investmentId: string;
  bankAccounts: { id: string; name: string }[];
  defaultBankId: string | null;
  today: string;
  canInvest: boolean;
}) {
  const [state, action, pending] = useActionState<FormState, FormData>(moveInvestmentMoney, {});
  const [direction, setDirection] = useState<"in" | "out">(canInvest ? "in" : "out");
  const [amount, setAmount] = useState("");
  const [bankId, setBankId] = useState(defaultBankId ?? "");
  const [date, setDate] = useState(today);
  const [note, setNote] = useState("");

  return (
    <form action={action} className="flex flex-col gap-4">
      <input type="hidden" name="investmentId" value={investmentId} />
      <input type="hidden" name="direction" value={direction} />

      <div className="seg self-start" role="tablist" aria-label="Invest or withdraw">
        {canInvest && (
          <button type="button" role="tab" aria-selected={direction === "in"} className="seg-item" data-active={direction === "in"} onClick={() => setDirection("in")}>
            Invest more
          </button>
        )}
        <button type="button" role="tab" aria-selected={direction === "out"} className="seg-item" data-active={direction === "out"} onClick={() => setDirection("out")}>
          Withdraw
        </button>
      </div>

      <div className="grid gap-3 sm:grid-cols-[1fr_1.4fr_1fr]">
        <div>
          <label className="label" htmlFor="m-amount">Amount</label>
          <div className="relative">
            <span className="pointer-events-none absolute top-1/2 left-3 -translate-y-1/2 text-sm" style={{ color: "var(--text-faint)" }}>
              ₹
            </span>
            <input id="m-amount" name="amount" className="input tnum pl-7" inputMode="decimal" placeholder="0.00" value={amount} onChange={(e) => setAmount(e.target.value)} required />
          </div>
        </div>
        <div>
          <label className="label" htmlFor="m-bank">{direction === "in" ? "Paid from" : "Paid into"}</label>
          <select id="m-bank" name="bankAccountId" className="select" value={bankId} onChange={(e) => setBankId(e.target.value)} required>
            <option value="">Pick an account</option>
            {bankAccounts.map((a) => (
              <option key={a.id} value={a.id}>{a.name}</option>
            ))}
          </select>
        </div>
        <div>
          <label className="label" htmlFor="m-date">On</label>
          <input id="m-date" name="date" type="date" className="input" value={date} onChange={(e) => setDate(e.target.value)} required />
        </div>
        <div className="sm:col-span-3">
          <label className="label" htmlFor="m-note">
            Description <span style={{ color: "var(--text-faint)" }}>(optional)</span>
          </label>
          <input id="m-note" name="note" className="input" placeholder={direction === "in" ? "e.g. October SIP" : "e.g. Partial redemption"} value={note} onChange={(e) => setNote(e.target.value)} maxLength={120} />
        </div>
      </div>

      {state.error && (
        <p className="text-sm" style={{ color: "var(--debit)" }} role="alert">
          {state.error}
        </p>
      )}

      <div>
        <button className="btn btn-primary btn-sm" type="submit" disabled={pending}>
          {pending ? "Saving…" : direction === "in" ? "Invest" : "Withdraw"}
        </button>
      </div>
    </form>
  );
}
