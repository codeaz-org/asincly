import { z } from "zod";
import type { SlackMessage } from "@/lib/slack/format";

// Minimal Slack Web API client over fetch (no SDK: we call five methods).
// Errors carry Slack's error code only, never message contents.

export const SLACK_SCOPES = ["chat:write", "channels:read", "channels:join", "groups:read", "users:read", "users:read.email", "im:write"];

export function slackConfigured(): boolean {
  return !!process.env.SLACK_CLIENT_ID && !!process.env.SLACK_CLIENT_SECRET;
}

export class SlackError extends Error {
  constructor(
    readonly method: string,
    readonly code: string,
  ) {
    super(`slack ${method}: ${code}`);
    this.name = "SlackError";
  }
}

const Base = z.object({ ok: z.boolean(), error: z.string().optional() }).passthrough();

async function call<T extends z.ZodTypeAny>(
  method: string,
  schema: T,
  params: Record<string, string | number | boolean | undefined>,
  auth: { token: string } | { basic: [string, string] },
): Promise<z.infer<T>> {
  const body = new URLSearchParams();
  for (const [k, v] of Object.entries(params)) if (v !== undefined) body.set(k, String(v));
  const authorization =
    "token" in auth
      ? `Bearer ${auth.token}`
      : `Basic ${Buffer.from(`${auth.basic[0]}:${auth.basic[1]}`).toString("base64")}`;
  const res = await fetch(`https://slack.com/api/${method}`, {
    method: "POST",
    headers: { authorization, "content-type": "application/x-www-form-urlencoded" },
    body,
    signal: AbortSignal.timeout(10_000),
  });
  if (!res.ok) throw new SlackError(method, `http_${res.status}`);
  const json: unknown = await res.json();
  const base = Base.safeParse(json);
  if (!base.success) throw new SlackError(method, "bad_response");
  if (!base.data.ok) throw new SlackError(method, base.data.error ?? "unknown_error");
  const parsed = schema.safeParse(json);
  if (!parsed.success) throw new SlackError(method, "bad_response");
  return parsed.data;
}

export function authorizeUrl(state: string, redirectUri: string): string {
  const url = new URL("https://slack.com/oauth/v2/authorize");
  url.searchParams.set("client_id", process.env.SLACK_CLIENT_ID ?? "");
  url.searchParams.set("scope", SLACK_SCOPES.join(","));
  url.searchParams.set("redirect_uri", redirectUri);
  url.searchParams.set("state", state);
  return url.toString();
}

const OAuthSchema = z.object({
  access_token: z.string(),
  bot_user_id: z.string(),
  team: z.object({ id: z.string(), name: z.string() }),
});

export function exchangeCode(code: string, redirectUri: string) {
  return call("oauth.v2.access", OAuthSchema, { code, redirect_uri: redirectUri }, {
    basic: [process.env.SLACK_CLIENT_ID ?? "", process.env.SLACK_CLIENT_SECRET ?? ""],
  });
}

const ChannelsSchema = z.object({
  channels: z.array(z.object({ id: z.string(), name: z.string(), is_private: z.boolean().optional() })),
  response_metadata: z.object({ next_cursor: z.string().optional() }).optional(),
});

export type SlackChannel = { id: string; name: string; isPrivate: boolean };

// Public channels, plus private ones the bot has been invited to.
export async function listChannels(token: string): Promise<SlackChannel[]> {
  const out: SlackChannel[] = [];
  let cursor: string | undefined;
  for (let page = 0; page < 5; page++) {
    const res = await call(
      "conversations.list",
      ChannelsSchema,
      { types: "public_channel,private_channel", exclude_archived: true, limit: 200, cursor },
      { token },
    );
    out.push(...res.channels.map((c) => ({ id: c.id, name: c.name, isPrivate: !!c.is_private })));
    cursor = res.response_metadata?.next_cursor || undefined;
    if (!cursor) break;
  }
  return out.sort((a, b) => a.name.localeCompare(b.name));
}

export async function joinChannel(token: string, channel: string): Promise<void> {
  await call("conversations.join", z.object({}).passthrough(), { channel }, { token });
}

export async function postMessage(token: string, channel: string, message: SlackMessage): Promise<void> {
  await call(
    "chat.postMessage",
    z.object({}).passthrough(),
    { channel, text: message.text, blocks: JSON.stringify(message.blocks), unfurl_links: false },
    { token },
  );
}

const LookupSchema = z.object({ user: z.object({ id: z.string() }) });

export async function lookupUserByEmail(token: string, email: string): Promise<string | null> {
  try {
    const res = await call("users.lookupByEmail", LookupSchema, { email }, { token });
    return res.user.id;
  } catch (e) {
    if (e instanceof SlackError && e.code === "users_not_found") return null;
    throw e;
  }
}

export async function revokeToken(token: string): Promise<void> {
  await call("auth.revoke", z.object({}).passthrough(), {}, { token });
}
