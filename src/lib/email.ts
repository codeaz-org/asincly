// Thin Resend wrapper. If RESEND_API_KEY is unset, logs to console instead
// (dev-friendly, no failed sends).

type SendArgs = {
  to: string;
  subject: string;
  text: string;
};

export async function sendEmail(args: SendArgs): Promise<void> {
  if (!process.env.RESEND_API_KEY) {
    console.log(`[email:noop] to=${args.to} subject="${args.subject}"\n${args.text}`);
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
