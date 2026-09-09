import { DrizzleAdapter } from "@auth/drizzle-adapter";
import NextAuth from "next-auth";
import Google from "next-auth/providers/google";
import Resend from "next-auth/providers/resend";
import { db } from "@/db";
import { accounts, sessions, users, verificationTokens } from "@/db/schema";

const providers = [];

if (process.env.AUTH_GOOGLE_ID && process.env.AUTH_GOOGLE_SECRET) {
  providers.push(Google);
}

providers.push(
  Resend({
    from: process.env.EMAIL_FROM ?? "Asincly <no-reply@asincly.local>",
    // ponytail: in dev without RESEND_API_KEY, log the magic link to the
    // server console instead of sending mail. Never do this in prod.
    async sendVerificationRequest({ identifier, url, provider }) {
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
        text: `Sign in: ${url}\n\nThis link expires in 24 hours.`,
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
  pages: { signIn: "/sign-in", error: "/sign-in" },
});
