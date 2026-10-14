import { H2, LegalHeader, P, Table, UL } from "@/components/legal";

export const metadata = { title: "Cookies" };

export default function CookiesPage() {
  return (
    <>
      <LegalHeader
        title="Cookies"
        intro="Asincly only stores what it needs to work, so there's no consent banner: strictly necessary storage doesn't need one."
      />

      <H2>Cookies</H2>
      <P>Set by our sign-in system. Over https their names carry a <code>__Secure-</code> or <code>__Host-</code> prefix.</P>
      <Table
        head={["Name", "Purpose", "Lifetime"]}
        rows={[
          [<code key="a">authjs.session-token</code>, "Keeps you signed in", "30 days, renewed while you use the app"],
          [<code key="b">authjs.csrf-token</code>, "Protects sign-in forms against cross-site request forgery", "Browser session"],
          [<code key="c">authjs.callback-url</code>, "Where to return after signing in", "Browser session"],
        ]}
      />

      <H2>Storage on your device</H2>
      <P>Kept in your browser&rsquo;s local storage, never sent to us on its own:</P>
      <Table
        head={["Key", "Purpose", "Removed"]}
        rows={[
          [<code key="a">asincly:notes:&lt;check-in&gt;</code>, "Private talking points you type while recording (sent only with your recording, to draft it)", "When you clear them"],
          [<code key="b">asincly:recent-emoji</code>, "Your recently used emoji", "When you clear site data"],
        ]}
      />

      <H2>What we don&rsquo;t do</H2>
      <UL>
        <li>No advertising or third-party analytics cookies.</li>
        <li>No cross-site tracking or fingerprinting.</li>
        <li>Fonts and emoji images are served by Asincly itself, not by third parties.</li>
      </UL>
      <P>If we ever add anything that needs consent, a consent choice ships with it.</P>
    </>
  );
}
