import { LegalHeader, P } from "@/components/legal";
import { operator } from "@/lib/legal";

export const metadata = { title: "Imprint" };

// Legal notice (e.g. § 5 DDG in Germany, § 5 ECG in Austria): who runs this
// service and how to reach them.
export default function ImprintPage() {
  const op = operator();
  return (
    <>
      <LegalHeader title="Imprint" intro="Who operates this service." />
      <P>
        <strong>{op.name}</strong>
        <br />
        {op.address}
        <br />
        {op.country}
      </P>
      {(op.registration || op.vatId) && (
        <P>
          {op.registration && <>Registration: {op.registration}</>}
          {op.registration && op.vatId && <br />}
          {op.vatId && <>VAT ID: {op.vatId}</>}
        </P>
      )}
      <P>
        Email: <a href={`mailto:${op.email}`}>{op.email}</a>
      </P>
    </>
  );
}
