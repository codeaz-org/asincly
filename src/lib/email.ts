// Thin Resend wrapper. If RESEND_API_KEY is unset, the email is skipped: in
// development it is printed to the console; in production only the fact that
// it was skipped is logged — bodies carry check-in text and addresses.

type SendArgs = {
  to: string;
  subject: string;
  text: string;
};

export async function sendEmail(args: SendArgs): Promise<void> {
  if (!process.env.RESEND_API_KEY) {
    if (process.env.NODE_ENV !== "production") {
      console.log(`[email:noop] to=${args.to} subject="${args.subject}"\n${args.text}`);
    } else {
      console.warn("[email] not sent: RESEND_API_KEY is unset");
    }
    return;
  }
  const { Resend } = await import("resend");
  const client = new Resend(process.env.RESEND_API_KEY);
  const from = process.env.EMAIL_FROM ?? "Asincly <no-reply@asincly.local>";
  const { error } = await client.emails.send({
    from,
    to: args.to,
    subject: args.subject,
    text: args.text,
  });
  if (error) throw new Error(`Resend: ${error.message}`);
}
