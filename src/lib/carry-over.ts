// Given a previous check-in's "Today" markdown, build the seed values for
// the next day: unchecked task-list items carry into Today; the whole
// previous Today becomes Yesterday (so the reader sees what was promised).

const TASK_ITEM = /^(\s*[-*+]\s+)\[( |x|X)\]\s?(.*)$/;

export function carryOver(prevToday: string): { yesterday: string; today: string } {
  if (!prevToday.trim()) return { yesterday: "", today: "" };

  const lines = prevToday.split("\n");
  const carried: string[] = [];
  for (const line of lines) {
    const m = line.match(TASK_ITEM);
    if (m && m[2] === " ") {
      carried.push(`- [ ] ${m[3].trim()}`);
    }
  }
  return {
    yesterday: prevToday,
    today: carried.join("\n"),
  };
}
