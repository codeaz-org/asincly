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
  // The one button in the email.
  action?: { label: string; url: string };
};

// Brand palette as hex: email clients don't understand oklch or CSS variables.
const C = {
  ground: "#14100c",
  card: "#1f1915",
  ink: "#f2eadb",
  soft: "#a99b8b",
  faint: "#7b6f63",
  line: "#2e2620",
  amber: "#f2a34d",
  amberInk: "#2b2117",
};
const SANS = "-apple-system,BlinkMacSystemFont,'Segoe UI',Roboto,Helvetica,Arial,sans-serif";
const MONO = "ui-monospace,SFMono-Regular,Menlo,Consolas,monospace";

const esc = (s: string) =>
  s.replace(/[&<>"']/g, (c) => ({ "&": "&amp;", "<": "&lt;", ">": "&gt;", '"': "&quot;", "'": "&#39;" })[c]!);

function appUrl(): string {
  return (process.env.NEXT_PUBLIC_APP_URL ?? "http://localhost:3000").replace(/\/$/, "");
}

// One layout for every email: the mark, a heading, short paragraphs, one amber
// button and a quiet footer. Tables and inline styles because that is what
// mail clients render. Every value is escaped: titles carry teammates' names.
export function renderEmail(args: {
  heading: string;
  text: string;
  action?: { label: string; url: string };
  footerHtml?: string; // trusted markup, built by the caller from escaped parts
}): string {
  const app = appUrl();
  const paragraphs = args.text
    .split(/\n{2,}/)
    .filter((p) => p.trim())
    .map(
      (p) =>
        `<p style="margin:0 0 16px;font:15px/1.6 ${SANS};color:${C.soft}">${esc(p.trim()).replace(/\n/g, "<br>")}</p>`,
    )
    .join("");
  const button = args.action
    ? `<table role="presentation" cellpadding="0" cellspacing="0" style="margin:8px 0 20px"><tr><td style="border-radius:10px;background:${C.amber}"><a href="${esc(args.action.url)}" style="display:inline-block;padding:12px 22px;font:600 15px ${SANS};color:${C.amberInk};text-decoration:none;border-radius:10px">${esc(args.action.label)}</a></td></tr></table>
<p style="margin:0;font:12px/1.5 ${SANS};color:${C.faint}">Or open this link: <a href="${esc(args.action.url)}" style="color:${C.faint};word-break:break-all">${esc(args.action.url)}</a></p>`
    : "";
  return `<!doctype html><html><head><meta charset="utf-8"><meta name="viewport" content="width=device-width,initial-scale=1"><meta name="color-scheme" content="dark"><meta name="supported-color-schemes" content="dark"><title>${esc(args.heading)}</title></head>
<body style="margin:0;padding:0;background:${C.ground}">
<table role="presentation" width="100%" cellpadding="0" cellspacing="0" style="background:${C.ground}"><tr><td align="center" style="padding:32px 16px">
<table role="presentation" width="100%" cellpadding="0" cellspacing="0" style="max-width:520px">
<tr><td style="padding:0 4px 16px"><a href="${esc(app)}" style="text-decoration:none"><img src="${esc(app)}/apple-icon" width="28" height="28" alt="" style="vertical-align:middle;border-radius:7px;border:0"><span style="vertical-align:middle;margin-left:10px;font:11px ${MONO};letter-spacing:0.18em;text-transform:uppercase;color:${C.soft}">Asincly</span></a></td></tr>
<tr><td style="background:${C.card};border:1px solid ${C.line};border-radius:16px;padding:28px">
<h1 style="margin:0 0 14px;font:600 20px/1.35 ${SANS};color:${C.ink}">${esc(args.heading)}</h1>
${paragraphs}${button}
</td></tr>
<tr><td style="padding:16px 4px 0;font:12px/1.6 ${SANS};color:${C.faint}">${args.footerHtml ?? "Sent by Asincly · async standups for remote teams"}</td></tr>
</table></td></tr></table></body></html>`;
}

export function emailFrom(): string {
  const from = process.env.EMAIL_FROM;
  if (from) return from;
  if (process.env.NODE_ENV === "production") throw new Error("EMAIL_FROM is not set");
  return "Asincly <no-reply@asincly.local>";
}

export async function sendEmail(args: SendArgs): Promise<void> {
  const body = args.action ? `${args.text}\n\n${args.action.label}: ${args.action.url}` : args.text;
  const text = args.unsubscribe
    ? `${body}\n\n—\nYou get this because you're on a team in Asincly. Stop ${args.unsubscribe.what}: ${args.unsubscribe.url}`
    : body;
  const html = renderEmail({
    heading: args.subject,
    text: args.text,
    action: args.action,
    footerHtml: args.unsubscribe
      ? `You get this because you're on a team in Asincly. <a href="${esc(args.unsubscribe.url)}" style="color:${C.soft}">Stop ${esc(args.unsubscribe.what)}</a>.`
      : undefined,
  });
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
    html,
    ...(args.unsubscribe && {
      headers: {
        "List-Unsubscribe": `<${args.unsubscribe.url.replace("/unsubscribe?", "/api/email/unsubscribe?")}>`,
        "List-Unsubscribe-Post": "List-Unsubscribe=One-Click",
      },
    }),
  });
  if (error) throw new Error(`Resend: ${error.message}`);
}
