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
    <main className="min-h-dvh px-6 py-16 md:py-24 flex items-start justify-center">
      <TzDetector currentTz={user.tz} />
      <form action={completeOnboarding} className="w-full max-w-xl space-y-14">
        <header className="space-y-4">
          <span className="inline-flex items-center gap-2 text-xs uppercase tracking-[0.2em] text-muted-foreground">
            <span className="size-1.5 rounded-full bg-accent" />
            setup · one screen
          </span>
          <h1 className="text-5xl font-medium tracking-tight leading-[0.95]">
            Spin up your team.
          </h1>
          <p className="text-base text-muted-foreground leading-relaxed">
            Signed in as <span className="text-foreground">{user.email}</span>.
            Everything below can be edited later.
          </p>
        </header>

        <Section index="01" title="Organization" hint="A container for your teams.">
          <Field name="orgName" placeholder="Acme, Inc." required autoFocus />
        </Section>

        <Section index="02" title="First team" hint="Where your standup happens.">
          <Field name="teamName" placeholder="Platform" required />
        </Section>

        <Section
          index="03"
          title="Cadence"
          hint="Pick a rhythm. Times are in each teammate's local zone."
        >
          <Field name="scheduleName" defaultValue="Daily standup" required />

          <div className="grid grid-cols-2 md:grid-cols-5 gap-2">
            {(
              [
                ["daily", "Every day"],
                ["weekdays", "Weekdays"],
                ["mwf", "M · W · F"],
                ["weekly", "Weekly"],
                ["custom", "Custom"],
              ] as const
            ).map(([val, label], i) => (
              <label
                key={val}
                className="cursor-pointer relative rounded-md border border-white/10 px-3 py-3 text-center text-sm hover:bg-white/[0.03] transition has-[input:checked]:border-accent has-[input:checked]:bg-accent/[0.08] has-[input:checked]:text-foreground"
              >
                <input
                  type="radio"
                  name="preset"
                  value={val}
                  defaultChecked={i === 1}
                  className="sr-only"
                />
                {label}
              </label>
            ))}
          </div>

          <input
            name="customRrule"
            placeholder="Custom RRULE — e.g. FREQ=WEEKLY;BYDAY=TU,TH"
            className="w-full h-11 rounded-md bg-white/[0.02] border border-white/10 px-3 text-sm font-mono placeholder:text-muted-foreground/50 focus:outline-none focus:border-white/30 focus:bg-white/[0.04] transition"
          />

          <div className="grid grid-cols-2 gap-3 pt-2">
            <TimeField name="windowOpen" label="Opens" defaultValue="09:00" />
            <TimeField name="windowClose" label="Closes" defaultValue="11:00" />
          </div>
          <p className="text-xs text-muted-foreground font-mono">
            your zone · {user.tz}
          </p>
        </Section>

        <div className="pt-4 border-t border-border">
          <button
            type="submit"
            className="w-full md:w-auto md:min-w-[240px] h-12 px-6 rounded-md bg-foreground text-primary-foreground text-sm font-medium hover:bg-foreground/90 active:scale-[0.99] transition inline-flex items-center justify-center gap-2"
          >
            Create everything →
          </button>
          <p className="mt-3 text-xs text-muted-foreground">
            You&rsquo;ll invite teammates on the next screen.
          </p>
        </div>
      </form>
    </main>
  );
}

function Section({
  index,
  title,
  hint,
  children,
}: {
  index: string;
  title: string;
  hint?: string;
  children: React.ReactNode;
}) {
  return (
    <section className="space-y-4">
      <div className="flex items-baseline gap-3">
        <span className="font-mono text-xs text-muted-foreground/70">{index}</span>
        <h2 className="text-2xl font-medium tracking-tight">{title}</h2>
      </div>
      {hint && <p className="text-sm text-muted-foreground -mt-2">{hint}</p>}
      <div className="space-y-3 pt-1">{children}</div>
    </section>
  );
}

function Field({
  name,
  placeholder,
  defaultValue,
  required,
  autoFocus,
}: {
  name: string;
  placeholder?: string;
  defaultValue?: string;
  required?: boolean;
  autoFocus?: boolean;
}) {
  return (
    <input
      id={name}
      name={name}
      placeholder={placeholder}
      defaultValue={defaultValue}
      required={required}
      autoFocus={autoFocus}
      className="w-full h-12 rounded-md bg-white/[0.02] border border-white/10 px-4 text-base placeholder:text-muted-foreground/50 focus:outline-none focus:border-white/30 focus:bg-white/[0.04] transition"
    />
  );
}

function TimeField({
  name,
  label,
  defaultValue,
}: {
  name: string;
  label: string;
  defaultValue: string;
}) {
  return (
    <label className="space-y-1.5 block">
      <span className="text-xs uppercase tracking-wider text-muted-foreground">
        {label}
      </span>
      <input
        name={name}
        type="time"
        defaultValue={defaultValue}
        required
        className="w-full h-11 rounded-md bg-white/[0.02] border border-white/10 px-3 text-sm font-mono focus:outline-none focus:border-white/30 focus:bg-white/[0.04] transition"
      />
    </label>
  );
}
