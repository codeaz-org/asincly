// Thin Resend wrapper. If RESEND_API_KEY is unset, the email is skipped: in
// development it is printed to the console; in production only the fact that
// it was skipped is logged — bodies carry check-in text and addresses.

type SendArgs = {
  to: string;
  subject: string;
  text: string;
  // Notification emails carry a one-click unsubscribe (RFC 8058) and a
  // footer saying how to stop them.
  unsubscribe?: { url: string; what: string };
};

export function emailFrom(): string {
  const from = process.env.EMAIL_FROM;
  if (from) return from;
  if (process.env.NODE_ENV === "production") throw new Error("EMAIL_FROM is not set");
  return "Asincly <no-reply@asincly.local>";
}

export async function sendEmail(args: SendArgs): Promise<void> {
  const text = args.unsubscribe
    ? `${args.text}\n\n—\nYou get this because you're on a team in Asincly. Stop ${args.unsubscribe.what}: ${args.unsubscribe.url}`
    : args.text;
  if (!process.env.RESEND_API_KEY) {
    if (process.env.NODE_ENV !== "production") {
      console.log(`[email:noop] to=${args.to} subject="${args.subject}"\n${text}`);
    } else {
      console.warn("[email] not sent: RESEND_API_KEY is unset");
    }
    return;
  }
  const { Resend } = await import("resend");
  const client = new Resend(process.env.RESEND_API_KEY);
  const { error } = await client.emails.send({
    from: emailFrom(),
    to: args.to,
    subject: args.subject,
    text,
    ...(args.unsubscribe && {
      headers: {
        "List-Unsubscribe": `<${args.unsubscribe.url.replace("/unsubscribe?", "/api/email/unsubscribe?")}>`,
        "List-Unsubscribe-Post": "List-Unsubscribe=One-Click",
      },
    }),
  });
  if (error) throw new Error(`Resend: ${error.message}`);
}
