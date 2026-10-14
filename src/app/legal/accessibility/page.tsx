import { H2, LegalHeader, P, UL } from "@/components/legal";
import { operator } from "@/lib/legal";

export const metadata = { title: "Accessibility" };

export default function AccessibilityPage() {
  const op = operator();
  return (
    <>
      <LegalHeader title="Accessibility" intro="We aim for WCAG 2.2 level AA." />
      <H2>What we do</H2>
      <UL>
        <li>Keyboard access throughout, visible focus, and screen-reader labels on controls.</li>
        <li>Respects reduced-motion settings; motion only on state changes.</li>
        <li>Every check-in can be written instead of recorded, and AI summaries give a text version of videos.</li>
        <li>Works at phone width; text scales with your browser&rsquo;s settings.</li>
      </UL>
      <H2>Known gaps</H2>
      <UL>
        <li>The app has a dark theme only.</li>
        <li>Videos don&rsquo;t have captions; the transcript-based summary is shown instead.</li>
        <li>The interface is in English only.</li>
      </UL>
      <H2>Tell us</H2>
      <P>
        If something gets in your way, email <a href={`mailto:${op.email}`}>{op.email}</a>. We reply within 5 business
        days.
      </P>
    </>
  );
}
