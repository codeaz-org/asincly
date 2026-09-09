import { redirect } from "next/navigation";
import { TzDetector } from "@/components/tz-detector";
import { completeOnboarding } from "@/lib/actions/onboarding";
import { getMemberships, requireUser } from "@/lib/session";

export default async function OnboardingPage() {
  const user = await requireUser();
  const memberships = await getMemberships(user.id);
  if (memberships.length > 0) {
    const m = memberships[0];
    redirect(`/${m.orgSlug}/${m.teamSlug}`);
  }

  return (
    <main className="min-h-dvh flex items-center justify-center p-6">
      <TzDetector currentTz={user.tz} />
      <form action={completeOnboarding} className="w-full max-w-lg space-y-8">
        <header className="space-y-1">
          <h1 className="text-2xl font-semibold">Set up your team</h1>
          <p className="text-sm text-muted-foreground">
            Signed in as {user.email}. You can invite teammates on the next screen.
          </p>
        </header>

        <section className="space-y-3">
          <h2 className="text-sm font-medium uppercase tracking-wide text-muted-foreground">
            Organization
          </h2>
          <Field name="orgName" label="Organization name" placeholder="Acme, Inc." required />
        </section>

        <section className="space-y-3">
          <h2 className="text-sm font-medium uppercase tracking-wide text-muted-foreground">
            First team
          </h2>
          <Field name="teamName" label="Team name" placeholder="Platform" required />
        </section>

        <section className="space-y-3">
          <h2 className="text-sm font-medium uppercase tracking-wide text-muted-foreground">
            Standup schedule
          </h2>
          <Field
            name="scheduleName"
            label="Schedule name"
            defaultValue="Daily standup"
            required
          />
          <div className="space-y-1">
            <label htmlFor="preset" className="text-sm font-medium">
              Cadence
            </label>
            <select
              id="preset"
              name="preset"
              defaultValue="weekdays"
              className="w-full h-10 rounded-md border border-input bg-background px-3 text-sm"
            >
              <option value="daily">Every day</option>
              <option value="weekdays">Weekdays (Mon–Fri)</option>
              <option value="mwf">Mon / Wed / Fri</option>
              <option value="weekly">Weekly (Monday)</option>
              <option value="custom">Custom RRULE</option>
            </select>
          </div>
          <div className="space-y-1">
            <label htmlFor="customRrule" className="text-sm font-medium">
              Custom RRULE (only used when cadence is Custom)
            </label>
            <input
              id="customRrule"
              name="customRrule"
              placeholder="FREQ=WEEKLY;BYDAY=TU,TH"
              className="w-full h-10 rounded-md border border-input bg-background px-3 text-sm font-mono"
            />
          </div>
          <div className="grid grid-cols-2 gap-3">
            <Field
              name="windowOpen"
              label="Window opens (local)"
              type="time"
              defaultValue="09:00"
              required
            />
            <Field
              name="windowClose"
              label="Window closes (local)"
              type="time"
              defaultValue="11:00"
              required
            />
          </div>
          <p className="text-xs text-muted-foreground">
            Times are in each teammate&apos;s local time zone. Your tz: {user.tz}.
          </p>
        </section>

        <button
          type="submit"
          className="w-full h-11 rounded-md bg-primary text-primary-foreground text-sm font-medium"
        >
          Create org, team &amp; schedule
        </button>
      </form>
    </main>
  );
}

function Field({
  name,
  label,
  type = "text",
  placeholder,
  defaultValue,
  required,
}: {
  name: string;
  label: string;
  type?: string;
  placeholder?: string;
  defaultValue?: string;
  required?: boolean;
}) {
  return (
    <div className="space-y-1">
      <label htmlFor={name} className="text-sm font-medium">
        {label}
      </label>
      <input
        id={name}
        name={name}
        type={type}
        placeholder={placeholder}
        defaultValue={defaultValue}
        required={required}
        className="w-full h-10 rounded-md border border-input bg-background px-3 text-sm"
      />
    </div>
  );
}
