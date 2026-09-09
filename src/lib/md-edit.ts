// Markdown editing helpers for the check-in writer. Pure functions over
// (value, selection) so they're unit-testable without a DOM.

export type EditResult = {
  value: string;
  /** caret position after the edit (selection collapsed) */
  caret: number;
} | null;

const LIST_RE = /^(\s*)([-*+]\s(?:\[[ xX]\]\s)?|\d+([.)])\s)(.*)$/;

function lineStartAt(value: string, caret: number): number {
  return value.lastIndexOf("\n", caret - 1) + 1;
}

// Enter pressed at `caret`: if the current line is a list item, continue the
// list (numbered lists increment). Enter on an EMPTY item clears the marker
// instead (the Obsidian behavior). Returns null when Enter should behave
// normally.
export function continueList(value: string, caret: number): EditResult {
  const start = lineStartAt(value, caret);
  const lineEnd = value.indexOf("\n", caret);
  const line = value.slice(start, lineEnd === -1 ? value.length : lineEnd);
  const m = line.match(LIST_RE);
  if (!m) return null;

  const [, indent, marker, numDelim, rest] = m;
  // Only continue when the caret sits at/after the marker.
  if (caret - start < indent.length + marker.length) return null;

  if (rest.trim() === "") {
    // Empty item: strip the marker, leave an empty line.
    const before = value.slice(0, start);
    const after = value.slice(caret);
    return { value: `${before}${indent}${after}`, caret: start + indent.length };
  }

  let next: string;
  if (numDelim) {
    const n = parseInt(marker, 10) + 1;
    next = `${indent}${n}${numDelim} `;
  } else {
    // "- [x] " continues as an unchecked task; "- " stays "- ".
    next = `${indent}${marker.replace(/\[[xX]\]/, "[ ]")}`;
  }
  const before = value.slice(0, caret);
  const after = value.slice(caret);
  const inserted = `\n${next}`;
  return { value: `${before}${inserted}${after}`, caret: caret + inserted.length };
}

// Tab / Shift+Tab on a list line: indent or outdent by two spaces. Works on
// the single line containing the caret. Returns null off list lines so Tab
// keeps its focus behavior elsewhere.
export function indentList(
  value: string,
  caret: number,
  outdent: boolean,
): EditResult {
  const start = lineStartAt(value, caret);
  const lineEnd = value.indexOf("\n", start);
  const line = value.slice(start, lineEnd === -1 ? value.length : lineEnd);
  if (!LIST_RE.test(line)) return null;

  if (outdent) {
    const trimmed = line.startsWith("  ") ? line.slice(2) : line.replace(/^\s/, "");
    const removed = line.length - trimmed.length;
    if (removed === 0) return { value, caret };
    const next =
      value.slice(0, start) + trimmed + value.slice(lineEnd === -1 ? value.length : lineEnd);
    return { value: next, caret: Math.max(start, caret - removed) };
  }
  const next =
    value.slice(0, start) + "  " + line + value.slice(lineEnd === -1 ? value.length : lineEnd);
  return { value: next, caret: caret + 2 };
}

// Wrap the selection in a marker pair (e.g. ** for bold). With no selection,
// insert the pair and put the caret between. If the selection is already
// wrapped, unwrap it.
export function wrapSelection(
  value: string,
  selStart: number,
  selEnd: number,
  marker: string,
): { value: string; selStart: number; selEnd: number } {
  const before = value.slice(0, selStart);
  const sel = value.slice(selStart, selEnd);
  const after = value.slice(selEnd);
  const L = marker.length;

  if (before.endsWith(marker) && after.startsWith(marker)) {
    // Unwrap outer markers.
    return {
      value: before.slice(0, -L) + sel + after.slice(L),
      selStart: selStart - L,
      selEnd: selEnd - L,
    };
  }
  if (sel.startsWith(marker) && sel.endsWith(marker) && sel.length >= 2 * L) {
    return {
      value: before + sel.slice(L, -L) + after,
      selStart,
      selEnd: selEnd - 2 * L,
    };
  }
  return {
    value: before + marker + sel + marker + after,
    selStart: selStart + L,
    selEnd: selEnd + L,
  };
}

// Insert a line prefix (e.g. "- [ ] ") at the start of the caret's line; if
// the line already has exactly that prefix, remove it (toggle).
export function toggleLinePrefix(
  value: string,
  caret: number,
  prefix: string,
): EditResult {
  const start = lineStartAt(value, caret);
  const rest = value.slice(start);
  if (rest.startsWith(prefix)) {
    return {
      value: value.slice(0, start) + rest.slice(prefix.length),
      caret: Math.max(start, caret - prefix.length),
    };
  }
  return {
    value: value.slice(0, start) + prefix + rest,
    caret: caret + prefix.length,
  };
}
