import Link from "next/link";
import { listGuides } from "@/lib/guides";

export const metadata = {
  title: "Guides",
  description: "Practical guides on async standups, remote teams and working across time zones.",
};

export default async function GuidesPage() {
  const guides = await listGuides();
  return (
    <div className="space-y-10">
      <header className="space-y-3">
        <p className="kicker">Guides</p>
        <h1 className="display text-4xl sm:text-5xl text-ink">Standups without the meeting.</h1>
        <p className="text-soft max-w-xl">How remote teams stay in sync across time zones, written by the people building Asincly.</p>
      </header>
      {guides.length === 0 ? (
        <p className="text-soft">The first guides are on their way.</p>
      ) : (
        <ul className="divide-y divide-line border-y border-line">
          {guides.map((g) => (
            <li key={g.slug}>
              <Link href={`/guides/${g.slug}`} className="block py-5 group">
                <h2 className="text-lg text-ink group-hover:underline underline-offset-4">{g.title}</h2>
                <p className="text-sm text-soft mt-1">{g.description}</p>
              </Link>
            </li>
          ))}
        </ul>
      )}
    </div>
  );
}
