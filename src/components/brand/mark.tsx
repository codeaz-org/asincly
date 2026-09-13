// The Asincly mark: one disc split by a thin seam. Night on the left
// (currentColor), morning on the right (amber), seam set left of centre so
// the morning side is bigger. One day, split across time zones, and the
// morning wins. Same geometry as src/app/icon.svg.
//
// Drawn with plain arc paths (no <clipPath> ids) so any number of marks can
// share a page. `state` turns the mark into the product's status glyph and
// `progress` fills the morning half from the seam outwards.

export type MarkState =
  | "done"
  | "open"
  | "before"
  | "missed"
  | "asleep"
  | "away"
  | "blocked"
  | "idle";

const R = 9.75;
const C = 12;
// Night half: the part of the disc left of x = 10.
const NIGHT = `M10 ${C - Math.sqrt(R * R - 4)} A${R} ${R} 0 0 0 10 ${C + Math.sqrt(R * R - 4)} Z`;
// Morning half: everything right of x = 12 (exactly half the disc).
const MORNING = `M12 ${C - R} A${R} ${R} 0 0 1 12 ${C + R} Z`;

// Morning slice between the seam (x = 12) and x = 12 + p·R.
function morningSlice(p: number): string {
  const t = Math.min(1, Math.max(0, p));
  if (t >= 1) return MORNING;
  const x = C + t * R;
  const h = Math.sqrt(R * R - (x - C) * (x - C));
  const f = (n: number) => n.toFixed(3);
  return `M12 ${f(C - R)} A${R} ${R} 0 0 1 ${f(x)} ${f(C - h)} L${f(x)} ${f(C + h)} A${R} ${R} 0 0 1 12 ${f(C + R)} Z`;
}

const AMBER = "var(--amber, oklch(0.78 0.15 60))";

export function LogoMark({
  size = 24,
  state = "idle",
  progress,
  className = "",
  title,
}: {
  size?: number;
  state?: MarkState;
  /** 0..1 — fills the morning half from the seam. Overrides `state` for the morning side. */
  progress?: number;
  className?: string;
  /** Accessible label. Omit for decorative marks. */
  title?: string;
}) {
  const night = nightStyle(state);
  const morning = morningStyle(state);
  const a11y = title ? { role: "img", "aria-label": title } : { "aria-hidden": true };

  return (
    <svg
      width={size}
      height={size}
      viewBox="0 0 24 24"
      fill="none"
      className={`shrink-0 ${className}`}
      {...a11y}
    >
      {title && <title>{title}</title>}
      <path d={NIGHT} {...night} />
      {progress !== undefined ? (
        <>
          <path d={MORNING} fill="none" stroke={AMBER} strokeOpacity={0.45} strokeWidth={1.2} />
          <path d={morningSlice(progress)} fill={AMBER} style={{ transition: "d 420ms cubic-bezier(0.23,1,0.32,1)" }} />
        </>
      ) : (
        <path
          d={MORNING}
          {...morning}
          className={state === "open" ? "animate-mark-breathe" : undefined}
        />
      )}
      {state === "away" && (
        <path d="M4.5 19.5 L19.5 4.5" stroke="currentColor" strokeOpacity={0.55} strokeWidth={1.4} strokeLinecap="round" />
      )}
    </svg>
  );
}

type PathProps = {
  fill: string;
  fillOpacity?: number;
  stroke?: string;
  strokeOpacity?: number;
  strokeWidth?: number;
};

function nightStyle(state: MarkState): PathProps {
  switch (state) {
    case "asleep":
      return { fill: "var(--cold, oklch(0.66 0.035 250))", fillOpacity: 0.85 };
    case "before":
      return { fill: "currentColor", fillOpacity: 0.55 };
    case "missed":
      return { fill: "currentColor", fillOpacity: 0.35 };
    case "away":
      return { fill: "none", stroke: "currentColor", strokeOpacity: 0.45, strokeWidth: 1.2 };
    default:
      return { fill: "currentColor" };
  }
}

function morningStyle(state: MarkState): PathProps {
  switch (state) {
    case "before":
      return { fill: "none", stroke: AMBER, strokeOpacity: 0.55, strokeWidth: 1.2 };
    case "asleep":
    case "missed":
      return { fill: "none", stroke: "currentColor", strokeOpacity: 0.25, strokeWidth: 1.2 };
    case "away":
      return { fill: "none", stroke: "currentColor", strokeOpacity: 0.45, strokeWidth: 1.2 };
    case "blocked":
      return { fill: "var(--danger, oklch(0.72 0.15 35))" };
    default:
      return { fill: AMBER };
  }
}

export const MARK_STATE_LABEL: Record<MarkState, string> = {
  done: "checked in",
  open: "window open",
  before: "window opens later",
  missed: "window closed",
  asleep: "asleep",
  away: "away",
  blocked: "blocked",
  idle: "",
};
