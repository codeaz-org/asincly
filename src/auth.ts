import { DrizzleAdapter } from "@auth/drizzle-adapter";
import NextAuth from "next-auth";
import Google from "next-auth/providers/google";
import Resend from "next-auth/providers/resend";
import { db } from "@/db";
import { and, eq, sql } from "drizzle-orm";
import { accounts, organizations, sessions, users, verificationTokens } from "@/db/schema";
import { emailFrom } from "@/lib/email";
import { rateLimit } from "@/lib/rate-limit";

const providers = [];

if (process.env.AUTH_GOOGLE_ID && process.env.AUTH_GOOGLE_SECRET) {
  // Linking by email lets someone who first signed in with a magic link use
  // Google later (and keeps them in when their org turns on SSO). Safe only
  // because the signIn callback refuses Google profiles whose email Google
  // hasn't verified.
  providers.push(Google({ allowDangerousEmailAccountLinking: true }));
}

providers.push(
  Resend({
    from: emailFrom(),
    // A sign-in link is a bearer credential sitting in an inbox: one hour.
    maxAge: 60 * 60,
    async sendVerificationRequest({ identifier, url, provider }) {
      // Every magic link passes through here, including requests made to
      // /api/auth directly rather than through the sign-in form. Caps mail
      // to one inbox (and the Resend bill).
      if (!(await rateLimit(`magic-link:${identifier.toLowerCase()}`, 5, 60 * 60 * 1000)).allowed) {
        throw new Error("Too many sign-in links requested for this address");
      }
      // ponytail: in dev without RESEND_API_KEY, log the magic link to the
      // server console instead of sending mail. Never do this in prod.
      if (process.env.NODE_ENV !== "production" && !process.env.RESEND_API_KEY) {
        console.log(`\n[auth] magic link for ${identifier}:\n${url}\n`);
        return;
      }
      const { Resend: ResendClient } = await import("resend");
      const client = new ResendClient(process.env.RESEND_API_KEY!);
      const { error } = await client.emails.send({
        from: provider.from as string,
        to: identifier,
        subject: "Sign in to Asincly",
        text: `Sign in to Asincly:\n${url}\n\nThis link expires in 1 hour and works once.\n\nIf you didn't ask to sign in, ignore this email; nobody can use your account without this link.`,
      });
      if (error) throw new Error(`Resend: ${error.message}`);
    },
  }),
);

export const { handlers, auth, signIn, signOut } = NextAuth({
  adapter: DrizzleAdapter(db, {
    usersTable: users,
    accountsTable: accounts,
    sessionsTable: sessions,
    verificationTokensTable: verificationTokens,
  }),
  session: { strategy: "database" },
  providers,
  // Expired/invalid magic links land back on our sign-in page instead of
  // Auth.js's unstyled default error screen.
  pages: { signIn: "/sign-in", error: "/sign-in", verifyRequest: "/sign-in?sent=1" },
  callbacks: {
    async signIn({ user, account, profile }) {
      const email = (user.email ?? "").toLowerCase();
      if (account?.provider === "google" && profile?.email_verified !== true) return "/sign-in?error=AccessDenied";
      // An org that requires SSO for its domain: no magic links, and only a
      // Google account managed by that domain's Workspace.
      const domain = email.split("@")[1];
      if (!domain) return true;
      const [org] = await db
        .select({ id: organizations.id })
        .from(organizations)
        .where(and(sql`lower(${organizations.ssoDomain}) = ${domain}`, eq(organizations.requireSso, true)))
        .limit(1);
      if (!org) return true;
      if (account?.provider === "google" && profile?.hd === domain) return true;
      return "/sign-in?error=SsoRequired";
    },
  },
});
