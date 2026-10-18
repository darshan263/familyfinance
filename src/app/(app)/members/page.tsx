import Link from "next/link";

import { Avatar } from "@/components/Avatar";
import { IconPlus } from "@/components/Icons";
import { Money } from "@/components/Money";
import { Notice } from "@/components/Notice";
import { PageHeader } from "@/components/PageHeader";
import { MEMBER_COLORS, swatch } from "@/lib/colors";
import { periodBounds } from "@/lib/period";
import { getMembers, sumByMember } from "@/lib/queries";
import { addMember, toggleMember, updateMember } from "./actions";

export const dynamic = "force-dynamic";

const ERRORS: Record<string, string> = {
  name: "A name is needed, at most 40 characters.",
  taken: "Someone already has that name.",
  missing: "That member no longer exists.",
};

export default async function MembersPage({
  searchParams,
}: {
  searchParams: Promise<{ saved?: string; error?: string }>;
}) {
  const sp = await searchParams;
  const fy = periodBounds("fy");
  const [members, spent, earned] = await Promise.all([
    getMembers(true),
    sumByMember("EXPENSE", fy),
    sumByMember("INCOME", fy),
  ]);
  const total = (slices: { id: string | null; cents: number }[], id: string | null) =>
    slices.find((s) => s.id === id)?.cents ?? 0;

  return (
    <div className="mx-auto max-w-3xl">
      <PageHeader
        title="Members"
        subtitle="The people in the household. They do not sign in; entries and accounts are tagged with them."
      />

      <div className="mb-4 flex flex-col gap-3">
        {sp.saved === "1" && <Notice tone="ok">Saved.</Notice>}
        {sp.error && <Notice tone="warn">{ERRORS[sp.error] ?? "That did not work."}</Notice>}
      </div>

      <div className="card divide-line mb-6 overflow-hidden">
        {[...members, null].map((m) => {
          const id = m?.id ?? null;
          return (
            <div key={id ?? "shared"} className="flex flex-wrap items-center gap-3 px-4 py-3" style={m && !m.isActive ? { opacity: 0.6 } : undefined}>
              <Avatar name={m?.name ?? null} color={m?.color} size={34} />
              <div className="min-w-0 flex-1">
                <p className="text-sm font-medium">
                  {m?.name ?? "Shared"}
                  {m && !m.isActive && <span className="chip ml-2">inactive</span>}
                </p>
                <p className="text-xs" style={{ color: "var(--text-faint)" }}>
                  {fy.label}: spent <Money cents={total(spent, id)} /> · earned <Money cents={total(earned, id)} />
                  {" · "}
                  <Link className="link" href={`/transactions?member=${id ?? "shared"}&range=1y`}>
                    entries
                  </Link>
                </p>
              </div>

              {m && (
                <details className="w-full sm:w-auto">
                  <summary className="btn btn-ghost btn-sm">Edit</summary>
                  <div className="mt-3 flex flex-col gap-3 sm:min-w-[22rem]">
                    <form action={updateMember} className="flex flex-col gap-3">
                      <input type="hidden" name="memberId" value={m.id} />
                      <input name="name" className="input" defaultValue={m.name} maxLength={40} required aria-label="Name" />
                      <div className="flex flex-wrap gap-2" role="radiogroup" aria-label="Colour">
                        {MEMBER_COLORS.map((c) => (
                          <label key={c} className="cursor-pointer" title={c}>
                            <input type="radio" name="color" value={c} defaultChecked={m.color === c} className="peer sr-only" />
                            <span
                              className="block h-7 w-7 rounded-full outline-offset-2 peer-checked:outline-2 peer-focus-visible:outline-2"
                              style={{ background: swatch(c).solid, outlineColor: "var(--text)" }}
                            />
                          </label>
                        ))}
                      </div>
                      <div>
                        <button className="btn btn-primary btn-sm" type="submit">
                          Save
                        </button>
                      </div>
                    </form>
                    <form action={toggleMember}>
                      <input type="hidden" name="memberId" value={m.id} />
                      <button className="btn btn-secondary btn-sm" type="submit">
                        {m.isActive ? "Deactivate" : "Reactivate"}
                      </button>
                      <span className="ml-2 text-xs" style={{ color: "var(--text-faint)" }}>
                        {m.isActive ? "Keeps their entries; hides them from new ones." : ""}
                      </span>
                    </form>
                  </div>
                </details>
              )}
            </div>
          );
        })}
      </div>

      <form action={addMember} className="card flex flex-wrap gap-2 p-4">
        <input name="name" className="input min-w-0 flex-1" placeholder="New member's name" maxLength={40} required />
        <button className="btn btn-primary" type="submit">
          <IconPlus size={16} />
          Add member
        </button>
      </form>
    </div>
  );
}
