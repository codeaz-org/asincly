export const metadata = { title: "Cookies · Asincly" };

export default function CookiesPage() {
  return (
    <>
      <p className="text-xs uppercase tracking-[0.22em] text-muted-foreground">Legal</p>
      <h1 className="text-4xl font-medium tracking-tight">Cookies</h1>
      <p className="text-sm text-muted-foreground">
        We set exactly one cookie. No banner because there&rsquo;s nothing to consent to
        beyond making the app work.
      </p>

      <h2 className="text-xl font-medium mt-8">The cookie we set</h2>
      <table className="text-sm w-full">
        <thead>
          <tr className="border-b border-white/10 text-muted-foreground text-left">
            <th className="py-2 pr-4">Name</th>
            <th className="py-2 pr-4">Purpose</th>
            <th className="py-2 pr-4">Lifetime</th>
            <th className="py-2">Type</th>
          </tr>
        </thead>
        <tbody>
          <tr className="border-b border-white/5">
            <td className="py-2 pr-4 font-mono">authjs.session-token</td>
            <td className="py-2 pr-4">Keeps you signed in.</td>
            <td className="py-2 pr-4 font-mono">30 days</td>
            <td className="py-2">Strictly necessary</td>
          </tr>
        </tbody>
      </table>

      <h2 className="text-xl font-medium mt-8">What we don&rsquo;t do</h2>
      <ul className="text-sm space-y-1 list-disc pl-5">
        <li>No advertising cookies.</li>
        <li>No third-party analytics.</li>
        <li>No cross-site tracking.</li>
        <li>No fingerprinting.</li>
      </ul>

      <p className="text-sm leading-relaxed mt-6">
        Under GDPR (ePrivacy Directive), strictly-necessary cookies don&rsquo;t require
        consent. So there&rsquo;s no popup blocking the app. If we ever add analytics or
        marketing cookies, a consent banner ships in the same PR.
      </p>
    </>
  );
}
