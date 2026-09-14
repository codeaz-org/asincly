import { cn } from "cn";
import {
  PRICE_PER_MEMBER,
  formatPrice,
  planComparison,
} from "@/lib/billing/plans";

export function PlanTable({
  current,
  className,
}: {
  current?: "free" | "pro" | null;
  className?: string;
}) {
  const rows = planComparison();
  return (
    <div className={className}>
      {/* Phones: one card per plan. */}
      <div className="grid gap-3 sm:hidden">
        {(
          [
            ["free", "Free", "€0", "forever"],
            [
              "pro",
              "Pro",
              formatPrice(PRICE_PER_MEMBER.month),
              `per member / month · ${formatPrice(PRICE_PER_MEMBER.year)} yearly`,
            ],
          ] as const
        ).map(([id, name, price, note]) => (
          <div
            key={id}
            className={cn(
              "rounded-2xl border px-4 py-4 space-y-3",
              id === "pro" ? "border-amber/30 bg-amber/[0.04]" : "border-line",
            )}
          >
            <div>
              <p className="flex items-center gap-2 kicker">
                {name}
                {current === id && (
                  <span className="rounded-full border border-amber/40 px-2 text-[10px] text-amber normal-case tracking-normal">
                    current
                  </span>
                )}
              </p>
              <p className="display text-2xl text-ink mt-1">{price}</p>
              <p className="text-xs text-soft">{note}</p>
            </div>
            <dl className="divide-y divide-line text-sm">
              {rows.map((r) => (
                <div key={r.label} className="flex justify-between gap-4 py-2">
                  <dt className="text-soft">{r.label}</dt>
                  <dd className="text-right text-ink">{r[id]}</dd>
                </div>
              ))}
            </dl>
          </div>
        ))}
      </div>
      <div className="hidden sm:block overflow-x-auto rounded-2xl border border-line">
        <table className="w-full text-sm">
          <caption className="sr-only">Free and Pro plans compared</caption>
          <thead>
            <tr className="border-b border-line">
              <th
                scope="col"
                className="w-2/5 px-4 py-4 text-left font-normal text-soft"
              >
                <span className="sr-only">Feature</span>
              </th>
              <PlanHead
                name="Free"
                price="€0"
                note="forever"
                active={current === "free"}
              />
              <PlanHead
                name="Pro"
                price={formatPrice(PRICE_PER_MEMBER.month)}
                note={`per member / month · ${formatPrice(PRICE_PER_MEMBER.year)} yearly`}
                active={current === "pro"}
                highlight
              />
            </tr>
          </thead>
          <tbody className="divide-y divide-line">
            {rows.map((r) => (
              <tr key={r.label}>
                <th
                  scope="row"
                  className="px-4 py-3 text-left font-normal text-soft"
                >
                  {r.label}
                </th>
                <td className="px-4 py-3 text-ink">{r.free}</td>
                <td className="px-4 py-3 text-ink bg-amber/[0.03]">{r.pro}</td>
              </tr>
            ))}
          </tbody>
        </table>
      </div>
    </div>
  );
}

function PlanHead({
  name,
  price,
  note,
  active,
  highlight,
}: {
  name: string;
  price: string;
  note: string;
  active: boolean;
  highlight?: boolean;
}) {
  return (
    <th
      scope="col"
      className={cn(
        "px-4 py-4 text-left align-bottom font-normal",
        highlight && "bg-amber/[0.05]",
      )}
    >
      <span className="flex items-center gap-2 kicker">
        {name}
        {active && (
          <span className="rounded-full border border-amber/40 px-2 text-[10px] text-amber normal-case tracking-normal">
            current
          </span>
        )}
      </span>
      <span className="block display text-2xl text-ink mt-1">{price}</span>
      <span className="block text-xs text-soft">{note}</span>
    </th>
  );
}
