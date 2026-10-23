// Wording for the one notification a check-in or reply gets for all its
// reactions. `people` is newest reactor first, one entry per person.
export function reactionNotice(
  people: Array<{ name: string; emoji: string[] }>,
  onReply: boolean,
): { title: string; body: string } {
  const names = people.map((p) => p.name);
  const who =
    names.length === 1
      ? names[0]
      : names.length === 2
        ? `${names[0]} and ${names[1]}`
        : `${names[0]}, ${names[1]} and ${names.length - 2} other${names.length > 3 ? "s" : ""}`;
  const emoji = [...new Set(people.flatMap((p) => p.emoji))].slice(0, 8);
  return { title: `${who} reacted to your ${onReply ? "reply" : "check-in"}`, body: emoji.join(" ") };
}
