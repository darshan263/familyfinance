"use client";

import { useActionState, useState } from "react";

import { accountGroup, ACCOUNT_GROUPS, ACCOUNT_TYPES, GROUP_LABELS } from "@/lib/accounts";
import { saveAccount, type FormState } from "./actions";

export interface AccountInitial {
  id: string;
  name: string;
  type: string;
  institution: string;
  ownerMemberId: string;
  /** As a person types it: owed amounts positive. */
  opening: string;
  openingDate: string;
  notes: string;
  isActive: boolean;
}

const OPENING_LABEL = {
  LIQUID: "Balance on that date",
  INVESTMENT: "Value on that date",
  LIABILITY: "Amount owed on that date",
} as const;

/** Create or edit an account. Controlled, so an error does not wipe what was typed. */
export function AccountForm({
  initial,
  members,
  today,
}: {
  initial?: AccountInitial;
  members: { id: string; name: string }[];
  today: string;
}) {
  const [state, action, pending] = useActionState<FormState, FormData>(saveAccount, {});
  const [name, setName] = useState(initial?.name ?? "");
  const [type, setType] = useState(initial?.type ?? "SAVINGS");
  const [institution, setInstitution] = useState(initial?.institution ?? "");
  const [ownerMemberId, setOwner] = useState(initial?.ownerMemberId ?? "");
  const [opening, setOpening] = useState(initial?.opening ?? "");
  const [openingDate, setOpeningDate] = useState(initial?.openingDate ?? today);
  const [notes, setNotes] = useState(initial?.notes ?? "");
  const [isActive, setActive] = useState(initial?.isActive ?? true);

  const group = accountGroup(type);

  return (
    <form action={action} className="card flex flex-col gap-4 p-5">
      {initial && <input type="hidden" name="accountId" value={initial.id} />}

      <div className="grid gap-4 sm:grid-cols-2">
        <div>
          <label className="label" htmlFor="name">
            Name
          </label>
          <input
            id="name"
            name="name"
            className="input"
            placeholder="e.g. HDFC Savings, Axis Bluechip SIP"
            value={name}
            onChange={(e) => setName(e.target.value)}
            maxLength={60}
            required
          />
        </div>
        <div>
          <label className="label" htmlFor="type">
            Type
          </label>
          <select id="type" name="type" className="select" value={type} onChange={(e) => setType(e.target.value)}>
            {ACCOUNT_GROUPS.map((g) => (
              <optgroup key={g} label={GROUP_LABELS[g]}>
                {ACCOUNT_TYPES.filter((t) => t.group === g).map((t) => (
                  <option key={t.key} value={t.key}>
                    {t.label}
                  </option>
                ))}
              </optgroup>
            ))}
          </select>
        </div>
        <div>
          <label className="label" htmlFor="institution">
            Bank / institution <span style={{ color: "var(--text-faint)" }}>(optional)</span>
          </label>
          <input
            id="institution"
            name="institution"
            className="input"
            value={institution}
            onChange={(e) => setInstitution(e.target.value)}
            maxLength={60}
          />
        </div>
        <div>
          <label className="label" htmlFor="ownerMemberId">
            Belongs to
          </label>
          <select
            id="ownerMemberId"
            name="ownerMemberId"
            className="select"
            value={ownerMemberId}
            onChange={(e) => setOwner(e.target.value)}
          >
            <option value="">Joint / household</option>
            {members.map((m) => (
              <option key={m.id} value={m.id}>
                {m.name}
              </option>
            ))}
          </select>
        </div>
        <div>
          <label className="label" htmlFor="openingDate">
            Tracking starts on
          </label>
          <input
            id="openingDate"
            name="openingDate"
            type="date"
            className="input"
            value={openingDate}
            onChange={(e) => setOpeningDate(e.target.value)}
            required
          />
        </div>
        <div>
          <label className="label" htmlFor="opening">
            {OPENING_LABEL[group]}
          </label>
          <div className="relative">
            <span
              className="pointer-events-none absolute top-1/2 left-3 -translate-y-1/2 text-sm"
              style={{ color: "var(--text-faint)" }}
            >
              ₹
            </span>
            <input
              id="opening"
              name="opening"
              className="input tnum pl-7"
              inputMode="decimal"
              placeholder="0.00"
              value={opening}
              onChange={(e) => setOpening(e.target.value)}
            />
          </div>
        </div>
      </div>

      <p className="text-xs" style={{ color: "var(--text-faint)" }}>
        {group === "LIQUID" &&
          "From here on the balance follows your entries. If it drifts from the bank, use Adjust balance on the account page."}
        {group === "INVESTMENT" &&
          "Record SIPs and top-ups as transfers into this account. Use Update value now and then, from your statement, to see the gain."}
        {group === "LIABILITY" &&
          "Card spends are expenses paid from this account; paying the bill is a transfer into it. For a loan, Update value with the outstanding amount from the lender's statement."}
      </p>

      <div>
        <label className="label" htmlFor="notes">
          Notes <span style={{ color: "var(--text-faint)" }}>(optional)</span>
        </label>
        <textarea
          id="notes"
          name="notes"
          className="textarea"
          placeholder="Account number ending, maturity date, nominee…"
          value={notes}
          onChange={(e) => setNotes(e.target.value)}
          maxLength={1000}
        />
      </div>

      {initial && (
        <label className="flex items-center gap-2 text-sm">
          <input type="checkbox" name="isActive" checked={isActive} onChange={(e) => setActive(e.target.checked)} />
          Active. Untick for a closed account: it stays in history and still counts towards net
          worth, but is no longer offered for new entries.
        </label>
      )}

      {state.error && (
        <p
          className="rounded-xl px-4 py-3 text-sm"
          style={{ background: "var(--debit-soft)", color: "var(--debit)" }}
          role="alert"
        >
          {state.error}
        </p>
      )}

      <div>
        <button className="btn btn-primary" type="submit" disabled={pending}>
          {pending ? "Saving…" : initial ? "Save changes" : "Add account"}
        </button>
      </div>
    </form>
  );
}
