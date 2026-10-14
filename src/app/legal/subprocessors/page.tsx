import Link from "next/link";
import { H2, LegalHeader, P, Table } from "@/components/legal";
import { dataRegion, operator, SUBPROCESSORS } from "@/lib/legal";

export const metadata = { title: "Subprocessors" };

export default function SubprocessorsPage() {
  const op = operator();
  return (
    <>
      <LegalHeader title="Subprocessors" intro="Companies that process personal data so Asincly can run, and what each one gets." />
      <P>
        The database and recordings are hosted in {dataRegion()}. Transfers outside the EU/EEA rely on the EU–US Data
        Privacy Framework for certified recipients or on the Standard Contractual Clauses.
      </P>
      <Table
        head={["Company", "What for", "Data", "Country"]}
        rows={SUBPROCESSORS.map((s) => [
          <strong key="n">{s.name}</strong>,
          <>
            {s.purpose}
            {s.when && <span className="block text-xs text-muted-foreground">{s.when}</span>}
          </>,
          s.data,
          s.country,
        ])}
      />
      <H2>Changes</H2>
      <P>
        We email organization owners at least 30 days before adding or replacing a subprocessor and update this page.
        To object, write to <a href={`mailto:${op.email}`}>{op.email}</a> within that time; see section 4 of the{" "}
        <Link href="/legal/dpa">DPA</Link>.
      </P>
      <P>
        Self-hosted instances use whichever providers their operator configures; their operator is responsible for this
        list.
      </P>
    </>
  );
}
