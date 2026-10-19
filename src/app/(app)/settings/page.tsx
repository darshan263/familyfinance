import { IconDownload, IconPlus } from "@/components/Icons";
import { Notice } from "@/components/Notice";
import { PageHeader } from "@/components/PageHeader";
import { formatRelative } from "@/lib/date";
import { prisma } from "@/lib/db";
import { getHouseholdName, getRecentActivity } from "@/lib/queries";
import { requireUser } from "@/lib/session";
import {
  addCategory,
  removeCategory,
  renameCategory,
  renameHousehold,
  signOutOtherDevices,
} from "./actions";
import { PasswordForm } from "./PasswordForm";

export const dynamic = "force-dynamic";

const SAVED: Record<string, string> = {
  household: "Household name saved.",
  devices: "Every other device has been signed out. This one stays signed in.",
  category: "Category saved.",
  archived: "Category archived. Its entries keep it; it is no longer offered for new ones.",
  deleted: "Category deleted.",
};

const ERRORS: Record<string, string> = {
  household: "The household name is needed, at most 60 characters.",
  category: "A category needs a name of at most 40 characters.",
  categoryTaken: "There is already a category with that name.",
  missing: "That category no longer exists.",
};

export default async function SettingsPage({
  searchParams,
}: {
  searchParams: Promise<{ saved?: string; error?: string }>;
}) {
  const sp = await searchParams;
  const [user, householdName, categories, activity] = await Promise.all([
    requireUser(),
    getHouseholdName(),
    prisma.category.findMany({
      include: { _count: { select: { transactions: { where: { deletedAt: null } } } } },
      orderBy: [{ kind: "asc" }, { sort: "asc" }, { name: "asc" }],
    }),
    getRecentActivity(15),
  ]);

  return (
    <div className="mx-auto flex max-w-3xl flex-col gap-6">
      <PageHeader title="Settings" />

      {sp.saved && SAVED[sp.saved] && <Notice tone="ok">{SAVED[sp.saved]}</Notice>}
      {sp.error && <Notice tone="warn">{ERRORS[sp.error] ?? "That did not work."}</Notice>}

      <section className="card p-5">
        <h2 className="mb-3 text-base font-semibold">Household</h2>
        <form action={renameHousehold} className="flex flex-wrap gap-2">
          <input name="householdName" className="input min-w-0 flex-1" defaultValue={householdName} maxLength={60} required />
          <button className="btn btn-secondary" type="submit">
            Save name
          </button>
        </form>
      </section>

      <section className="card p-5">
        <h2 className="text-base font-semibold">Login</h2>
        <p className="mt-1 mb-4 text-sm" style={{ color: "var(--text-muted)" }}>
          Signed in as {user.email}. This is the only login, so keep the password somewhere safe.
        </p>
        <PasswordForm />
        <form action={signOutOtherDevices} className="mt-5 border-t pt-4">
          <p className="mb-2 text-sm" style={{ color: "var(--text-muted)" }}>
            Lost a phone, or signed in on a computer that is not yours? This signs out every
            other device without changing the password. Everyone sharing the login will need to
            sign in again.
          </p>
          <button className="btn btn-secondary btn-sm" type="submit">
            Sign out all other devices
          </button>
        </form>
      </section>

      <section className="card p-5">
        <h2 className="text-base font-semibold">Categories</h2>
        <p className="mt-1 mb-4 text-sm" style={{ color: "var(--text-muted)" }}>
          A category with entries can be archived but not deleted, so past reports stay as they
          were.
        </p>

        {(["EXPENSE", "INCOME"] as const).map((kind) => (
          <div key={kind} className="mb-5">
            <h3 className="mb-2 text-sm font-semibold">{kind === "EXPENSE" ? "Expense" : "Income"}</h3>
            <div className="divide-line rounded-xl border">
              {categories
                .filter((c) => c.kind === kind)
                .map((c) => (
                  <div key={c.id} className="flex flex-wrap items-center gap-2 px-3 py-2" style={c.isActive ? undefined : { opacity: 0.6 }}>
                    <form action={renameCategory} className="flex min-w-0 flex-1 gap-2">
                      <input type="hidden" name="categoryId" value={c.id} />
                      <input name="name" className="input py-1 text-sm" defaultValue={c.name} maxLength={40} required aria-label={`Rename ${c.name}`} />
                      <button className="btn btn-ghost btn-sm" type="submit">
                        Rename
                      </button>
                    </form>
                    <span className="text-xs" style={{ color: "var(--text-faint)" }}>
                      {c._count.transactions} {c._count.transactions === 1 ? "entry" : "entries"}
                    </span>
                    <form action={removeCategory}>
                      <input type="hidden" name="categoryId" value={c.id} />
                      <button className="btn btn-ghost btn-sm" type="submit">
                        {c._count.transactions === 0 ? "Delete" : c.isActive ? "Archive" : "Restore"}
                      </button>
                    </form>
                  </div>
                ))}
            </div>
            <form action={addCategory} className="mt-2 flex gap-2">
              <input type="hidden" name="kind" value={kind} />
              <input name="name" className="input min-w-0 flex-1" placeholder={`New ${kind.toLowerCase()} category`} maxLength={40} required />
              <button className="btn btn-secondary btn-sm" type="submit">
                <IconPlus size={15} />
                Add
              </button>
            </form>
          </div>
        ))}
      </section>

      <section className="card p-5">
        <h2 className="text-base font-semibold">Your data</h2>
        <p className="mt-1 mb-4 text-sm" style={{ color: "var(--text-muted)" }}>
          A full export of every entry, with a summary and today&apos;s account positions. Worth
          downloading now and then as a backup of your own; the database provider keeps the
          real backups, so check that point-in-time restore is switched on there.
        </p>
        <div className="flex flex-wrap gap-2">
          <a className="btn btn-secondary" href="/api/export?format=xlsx&range=all">
            <IconDownload size={16} />
            Everything as Excel
          </a>
          <a className="btn btn-secondary" href="/api/export?format=csv&range=all">
            Everything as CSV
          </a>
        </div>
      </section>

      <section className="card p-5">
        <h2 className="mb-3 text-base font-semibold">Recent changes</h2>
        {activity.length === 0 ? (
          <p className="text-sm" style={{ color: "var(--text-faint)" }}>
            Nothing yet.
          </p>
        ) : (
          <ul className="flex flex-col gap-1.5 text-sm">
            {activity.map((a) => (
              <li key={a.id} className="flex gap-3">
                <span className="w-20 shrink-0 text-xs" style={{ color: "var(--text-faint)" }}>
                  {formatRelative(a.createdAt)}
                </span>
                <span>{a.summary}</span>
              </li>
            ))}
          </ul>
        )}
      </section>
    </div>
  );
}
