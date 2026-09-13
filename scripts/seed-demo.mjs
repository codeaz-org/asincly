#!/usr/bin/env node
// Local demo workspace: a fictional team across time zones with check-ins,
// blockers, replies, emoji reactions and an away teammate.
//
//   pnpm db:seed            → sign in at /sign-in as demo@asincly.local
//                             (the magic link prints in the dev server log)
//   pnpm db:seed --session  → also prints a session token (for screenshots/tests)
//
// Refuses to run against anything but a local database unless --force.
import "dotenv/config";
import { randomUUID } from "node:crypto";
import postgres from "postgres";

const url = process.env.DATABASE_URL;
if (!url) throw new Error("DATABASE_URL is required");
const local = /@(localhost|127\.0\.0\.1|postgres)(:\d+)?\//.test(url);
if ((!local || process.env.NODE_ENV === "production") && !process.argv.includes("--force")) {
  console.error("Refusing to seed a non-local database. Pass --force if you really mean it.");
  process.exit(1);
}

const sql = postgres(url, { max: 1, onnotice: () => {} });
const iso = (daysAgo, tz) =>
  new Intl.DateTimeFormat("en-CA", { timeZone: tz }).format(new Date(Date.now() - daysAgo * 86_400_000));

const VIEWER = { name: "Alex Rivera", email: "demo@asincly.local", tz: "Europe/Lisbon" };
const TEAM = [
  { name: "Mia Tane", tz: "Pacific/Auckland" },
  { name: "Kenji Sato", tz: "Asia/Tokyo" },
  { name: "Asha Menon", tz: "Asia/Kolkata" },
  { name: "Jonas Weber", tz: "Europe/Berlin" },
  { name: "Nora Okafor", tz: "Africa/Lagos" },
  { name: "Lucía Ortega", tz: "America/Sao_Paulo" },
  { name: "Sam Carter", tz: "America/New_York" },
  { name: "Riley Park", tz: "America/Los_Angeles" },
];

try {
  await sql.begin(async (tx) => {
    // Idempotent: drop a previous demo org and its users.
    await tx`DELETE FROM organization WHERE slug = 'northwind'`;
    await tx`DELETE FROM "user" WHERE email LIKE '%@asincly.local'`;

    const [org] = await tx`INSERT INTO organization (name, slug) VALUES ('Northwind Labs', 'northwind') RETURNING id`;
    const [team] = await tx`INSERT INTO team (org_id, name, slug) VALUES (${org.id}, 'Product', 'product') RETURNING id`;
    const [schedule] = await tx`
      INSERT INTO schedule (team_id, name, rrule, window_open_local, window_close_local)
      VALUES (${team.id}, 'Daily check-in', 'FREQ=WEEKLY;BYDAY=MO,TU,WE,TH,FR,SA,SU', '09:00', '11:00')
      RETURNING id`;

    const people = [VIEWER, ...TEAM.map((p) => ({ ...p, email: `${p.name.split(" ")[0].toLowerCase()}@asincly.local` }))];
    const ids = {};
    for (const [i, p] of people.entries()) {
      const [u] = await tx`
        INSERT INTO "user" (id, name, email, tz, "emailVerified")
        VALUES (${randomUUID()}, ${p.name}, ${p.email}, ${p.tz}, now()) RETURNING id`;
      ids[p.name] = u.id;
      await tx`INSERT INTO member (team_id, user_id, role) VALUES (${team.id}, ${u.id}, ${i === 0 ? "owner" : i === 4 ? "admin" : "member"})`;
    }
    const mention = (name) => `[@${name}](mention:${ids[name]})`;

    const occurrence = async (date) => {
      const [o] = await tx`
        INSERT INTO occurrence (schedule_id, schedule_date) VALUES (${schedule.id}, ${date})
        ON CONFLICT (schedule_id, schedule_date) DO UPDATE SET schedule_date = EXCLUDED.schedule_date
        RETURNING id`;
      return o.id;
    };
    const checkIn = async (who, daysAgo, minutesAgo, fields) => {
      const date = iso(daysAgo, VIEWER.tz);
      const [ci] = await tx`
        INSERT INTO check_in (occurrence_id, user_id, status, yesterday, today, blockers, local_date, submitted_at)
        VALUES (${await occurrence(date)}, ${ids[who]}, 'submitted', ${fields.yesterday ?? ""}, ${fields.today ?? ""},
                ${fields.blockers ?? ""}, ${date}, now() - make_interval(days => ${daysAgo}, mins => ${minutesAgo}))
        RETURNING id`;
      return ci.id;
    };

    // Yesterday: the viewer's plan, so today's recording screen has context.
    await checkIn("Alex Rivera", 1, 30, {
      yesterday: "- [x] Wrote the onboarding copy",
      today: "- [ ] Ship the pricing page\n- [ ] Review Kenji's billing PR\n- [ ] Plan the beta invite email",
    });
    await checkIn("Jonas Weber", 1, 90, { today: "- [ ] Fix the flaky sync test" });

    // Today.
    const mia = await checkIn("Mia Tane", 0, 400, {
      yesterday: "- [x] Finished the empty states\n- [x] Paired with Asha on charts",
      today: "- [ ] Polish the mobile check-in flow\n- [ ] Design review with the team",
    });
    const kenji = await checkIn("Kenji Sato", 0, 260, {
      yesterday: "- [x] Billing webhooks retried safely",
      today: `- [ ] Split the billing PR for ${mention("Alex Rivera")}\n- [ ] Load test the export job`,
      blockers: "- Waiting on production Stripe keys",
    });
    const asha = await checkIn("Asha Menon", 0, 180, {
      yesterday: "- [x] Weekly metrics rebuilt on the new warehouse",
      today: "- [ ] Retention chart for the board deck\n- [x] Clean up old dashboards",
    });
    const jonas = await checkIn("Jonas Weber", 0, 95, {
      yesterday: "- [x] Fixed the flaky sync test",
      today: "- [ ] Offline mode spike\n- [ ] Pair with Nora on push notifications",
      blockers: `- Need design sign-off on the offline banner from ${mention("Mia Tane")}`,
    });

    const react = (checkInId, who, emoji, commentId = null) =>
      tx`INSERT INTO check_in_reaction (check_in_id, comment_id, user_id, emoji) VALUES (${checkInId}, ${commentId}, ${ids[who]}, ${emoji})`;
    for (const [ci, who, emoji] of [
      [mia, "Alex Rivera", "🎉"], [mia, "Kenji Sato", "🎉"], [mia, "Sam Carter", "🙌"],
      [kenji, "Asha Menon", "👀"], [asha, "Mia Tane", "📈"], [asha, "Alex Rivera", "🔥"], [jonas, "Nora Okafor", "👍"],
    ]) await react(ci, who, emoji);

    const [comment] = await tx`
      INSERT INTO check_in_comment (check_in_id, user_id, body)
      VALUES (${kenji}, ${ids["Sam Carter"]}, ${"I can grab the Stripe keys when I'm up — ping me if it's urgent 🙏"})
      RETURNING id`;
    await react(kenji, "Kenji Sato", "🙏", comment.id);

    await tx`INSERT INTO member_away (team_id, user_id, starts_on, ends_on, note)
             VALUES (${team.id}, ${ids["Riley Park"]}, ${iso(1, "America/Los_Angeles")}, ${iso(-2, "America/Los_Angeles")}, 'Conference')`;
  });

  const [viewer] = await sql`SELECT id FROM "user" WHERE email = ${VIEWER.email}`;
  console.log("Demo workspace ready: /northwind/product");
  console.log(`Sign in as ${VIEWER.email} (the magic link prints in the dev server log).`);
  if (process.argv.includes("--session")) {
    const token = randomUUID();
    await sql`INSERT INTO session ("sessionToken", "userId", expires) VALUES (${token}, ${viewer.id}, now() + interval '7 days')`;
    console.log(`session=${token}`);
  }
} finally {
  await sql.end();
}
