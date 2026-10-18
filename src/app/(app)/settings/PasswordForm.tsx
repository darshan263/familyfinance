"use client";

import { useActionState } from "react";

import { changePassword, type PasswordState } from "./actions";

export function PasswordForm() {
  const [state, action, pending] = useActionState<PasswordState, FormData>(changePassword, {});

  return (
    <form action={action} className="grid gap-3 sm:grid-cols-3">
      <div>
        <label className="label" htmlFor="current">
          Current password
        </label>
        <input id="current" name="current" type="password" className="input" required autoComplete="current-password" />
      </div>
      <div>
        <label className="label" htmlFor="next">
          New password
        </label>
        <input id="next" name="next" type="password" className="input" required minLength={10} autoComplete="new-password" />
      </div>
      <div>
        <label className="label" htmlFor="confirm">
          Confirm new password
        </label>
        <input id="confirm" name="confirm" type="password" className="input" required autoComplete="new-password" />
      </div>
      {state.error && (
        <p className="text-sm sm:col-span-3" style={{ color: "var(--debit)" }} role="alert">
          {state.error}
        </p>
      )}
      {state.ok && (
        <p className="text-sm sm:col-span-3" style={{ color: "var(--credit)" }} role="status">
          Password changed. Every other device has been signed out.
        </p>
      )}
      <div className="sm:col-span-3">
        <button className="btn btn-primary btn-sm" type="submit" disabled={pending}>
          {pending ? "Changing…" : "Change password"}
        </button>
      </div>
    </form>
  );
}
