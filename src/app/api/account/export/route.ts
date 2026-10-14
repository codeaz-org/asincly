import { eq } from "drizzle-orm";
import { NextResponse } from "next/server";
import { db } from "@/db";
import {
  blockerActions,
  checkInComments,
  checkInReactions,
  checkIns,
  memberAway,
  members,
  notifications,
  organizations,
  recordings,
  teams,
  users,
} from "@/db/schema";
import { decrypt } from "@/lib/crypto";
import { rateLimit } from "@/lib/rate-limit";
import { presignedGetUrl } from "@/lib/s3";
import { requireUser } from "@/lib/session";

export const dynamic = "force-dynamic";

const VIDEO_LINK_SECONDS = 60 * 60;

// Everything a person has put into Asincly (GDPR Art. 15 and 20), including
// what they wrote in teams they have since left: read on the owner
// connection, filtered to this user only. Videos come as links valid for an
// hour, since the files themselves live in the bucket.
export async function GET() {
  const user = await requireUser();
  if (!(await rateLimit(`self-export:${user.id}`, 5, 60 * 60 * 1000)).allowed) {
    return NextResponse.json({ error: "Too many exports — try again later." }, { status: 429 });
  }
  const [profile, memberships, myCheckIns, myRecordings, myComments, myReactions, myBlockerActions, myAway, myNotifications] =
    await Promise.all([
      db
        .select({ email: users.email, name: users.name, tz: users.tz, createdAt: users.createdAt, emailReminders: users.emailReminders, emailActivity: users.emailActivity, aiOptOut: users.aiOptOut })
        .from(users)
        .where(eq(users.id, user.id)),
      db
        .select({ organization: organizations.name, team: teams.name, role: members.role, joinedAt: members.createdAt })
        .from(members)
        .innerJoin(teams, eq(teams.id, members.teamId))
        .innerJoin(organizations, eq(organizations.id, teams.orgId))
        .where(eq(members.userId, user.id)),
      db.select().from(checkIns).where(eq(checkIns.userId, user.id)),
      db.select().from(recordings).where(eq(recordings.userId, user.id)),
      db.select().from(checkInComments).where(eq(checkInComments.userId, user.id)),
      db.select().from(checkInReactions).where(eq(checkInReactions.userId, user.id)),
      db.select().from(blockerActions).where(eq(blockerActions.userId, user.id)),
      db.select().from(memberAway).where(eq(memberAway.userId, user.id)),
      db.select().from(notifications).where(eq(notifications.userId, user.id)),
    ]);

  const open = (cipher: string, context: string) => {
    try {
      return cipher ? decrypt(cipher, context) : "";
    } catch {
      return "";
    }
  };

  const bundle = {
    exportedAt: new Date().toISOString(),
    profile: profile[0],
    memberships,
    checkIns: myCheckIns,
    recordings: await Promise.all(
      myRecordings.map(async (r) => ({
        id: r.id,
        checkInId: r.checkInId,
        createdAt: r.createdAt,
        durationMs: r.durationMs,
        mimeType: r.mimeType,
        videoUrl: await presignedGetUrl(r.objectKey, VIDEO_LINK_SECONDS).catch(() => null),
        transcript: open(r.transcriptCipher, `recording:${r.id}:transcript`),
        summary: open(r.summaryCipher, `recording:${r.id}:summary`),
      })),
    ),
    videoLinksExpireAt: new Date(Date.now() + VIDEO_LINK_SECONDS * 1000).toISOString(),
    comments: myComments.filter((c) => !c.deletedAt),
    reactions: myReactions,
    blockerActions: myBlockerActions,
    awayPeriods: myAway,
    notifications: myNotifications,
  };

  return new NextResponse(JSON.stringify(bundle, null, 2), {
    headers: {
      "content-type": "application/json",
      "content-disposition": `attachment; filename="asincly-my-data-${new Date().toISOString().slice(0, 10)}.json"`,
      "cache-control": "no-store",
    },
  });
}
