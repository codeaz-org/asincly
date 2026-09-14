import { noteItems, plainText } from "@/lib/note-items";

// Slack messages built from check-ins. Pure, so the exact text is testable.
// Slack mrkdwn treats &, < and > specially; everything user-written is escaped.

export function escapeSlack(text: string): string {
  return text.replace(/&/g, "&amp;").replace(/</g, "&lt;").replace(/>/g, "&gt;");
}

const clip = (s: string, n: number) => (s.length > n ? `${s.slice(0, n - 1)}…` : s);

type Block = Record<string, unknown>;
export type SlackMessage = { text: string; blocks: Block[] };

export type DigestEntry = { name: string; today: string; blockers: string };

const MAX_PEOPLE = 15;
const MAX_ITEMS = 3;

export function digestMessage(input: {
  teamName: string;
  dateLabel: string;
  url: string;
  entries: DigestEntry[];
  expected: number;
}): SlackMessage {
  const { teamName, dateLabel, url, entries, expected } = input;
  const blockers = entries.flatMap((e) =>
    noteItems(e.blockers)
      .filter((i) => i.checked !== true)
      .map((i) => ({ name: e.name, text: plainText(i.text) })),
  );
  const headline = `${entries.length} of ${expected} checked in`;
  const text = `${teamName} · ${dateLabel}: ${headline}${blockers.length ? `, ${blockers.length} blocker${blockers.length > 1 ? "s" : ""}` : ""}`;

  const blocks: Block[] = [
    { type: "header", text: { type: "plain_text", text: clip(`${teamName} · ${dateLabel}`, 150) } },
    { type: "context", elements: [{ type: "mrkdwn", text: headline }] },
  ];

  if (blockers.length > 0) {
    blocks.push({
      type: "section",
      text: {
        type: "mrkdwn",
        text: clip(
          `*Blockers*\n${blockers
            .slice(0, 10)
            .map((b) => `• ${escapeSlack(b.text)} — _${escapeSlack(b.name)}_`)
            .join("\n")}`,
          2900,
        ),
      },
    });
  }

  for (const e of entries.slice(0, MAX_PEOPLE)) {
    const items = noteItems(e.today).slice(0, MAX_ITEMS);
    if (items.length === 0) continue;
    const more = noteItems(e.today).length - items.length;
    blocks.push({
      type: "section",
      text: {
        type: "mrkdwn",
        text: clip(
          `*${escapeSlack(e.name)}*\n${items.map((i) => `• ${escapeSlack(plainText(i.text))}`).join("\n")}${more > 0 ? `\n_+${more} more_` : ""}`,
          2900,
        ),
      },
    });
  }
  if (entries.length > MAX_PEOPLE) {
    blocks.push({ type: "context", elements: [{ type: "mrkdwn", text: `+${entries.length - MAX_PEOPLE} more people` }] });
  }

  blocks.push({
    type: "actions",
    elements: [{ type: "button", text: { type: "plain_text", text: "Open in Asincly" }, url }],
  });
  return { text, blocks };
}

export function reminderMessage(input: { teamName: string; closesAt: string; url: string }): SlackMessage {
  const text = `Your ${input.teamName} check-in window is open until ${input.closesAt}.`;
  return {
    text,
    blocks: [
      { type: "section", text: { type: "mrkdwn", text: escapeSlack(text) } },
      {
        type: "actions",
        elements: [{ type: "button", style: "primary", text: { type: "plain_text", text: "Check in" }, url: input.url }],
      },
    ],
  };
}
