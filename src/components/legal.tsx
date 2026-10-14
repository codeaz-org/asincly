// Shared typography for /legal pages, so each page is just its words.

export function LegalHeader({ title, intro }: { title: string; intro?: React.ReactNode }) {
  return (
    <>
      <p className="text-xs uppercase tracking-[0.22em] text-muted-foreground">Legal</p>
      <h1 className="text-4xl font-medium tracking-tight">{title}</h1>
      {intro && <p className="text-sm text-muted-foreground">{intro}</p>}
    </>
  );
}

export const H2 = ({ children, id }: { children: React.ReactNode; id?: string }) => (
  <h2 id={id} className="text-xl font-medium mt-10 scroll-mt-24">
    {children}
  </h2>
);

export const H3 = ({ children }: { children: React.ReactNode }) => <h3 className="text-base font-medium mt-6">{children}</h3>;

export const P = ({ children }: { children: React.ReactNode }) => <p className="text-sm leading-relaxed">{children}</p>;

export const UL = ({ children }: { children: React.ReactNode }) => (
  <ul className="text-sm leading-relaxed space-y-1.5 list-disc pl-5">{children}</ul>
);

export function Table({ head, rows }: { head: string[]; rows: React.ReactNode[][] }) {
  return (
    <div className="overflow-x-auto">
      <table className="text-sm w-full align-top">
        <thead>
          <tr className="border-b border-line text-muted-foreground text-left">
            {head.map((h) => (
              <th key={h} className="py-2 pr-4 font-normal">
                {h}
              </th>
            ))}
          </tr>
        </thead>
        <tbody>
          {rows.map((r, i) => (
            <tr key={i} className="border-b border-line align-top">
              {r.map((c, j) => (
                <td key={j} className="py-2 pr-4">
                  {c}
                </td>
              ))}
            </tr>
          ))}
        </tbody>
      </table>
    </div>
  );
}
