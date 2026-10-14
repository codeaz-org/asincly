import { MarkLoader } from "@/components/brand/loader";

// Outside the team shell (account, onboarding, legal): the same mark the
// shell shows while a page streams in.
export default function Loading() {
  return (
    <div className="min-h-dvh grid place-items-center">
      <MarkLoader size="md" label="Loading" />
    </div>
  );
}
