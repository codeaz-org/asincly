import ReactMarkdown from "react-markdown";
import remarkGfm from "remark-gfm";
import { MENTION_HREF_PREFIX } from "@/lib/mentions";

// Tight markdown block for check-in body. GFM enables task lists.
// Sanitization is on by default in react-markdown (no raw HTML).
// `currentUserId` makes mentions of the viewer stand out.
export function Markdown({
  children,
  currentUserId,
}: {
  children: string;
  currentUserId?: string;
}) {
  if (!children.trim()) {
    return <p className="text-sm text-faint">Nothing here.</p>;
  }
  return (
    <div className="prose-tight">
      <ReactMarkdown
        remarkPlugins={[remarkGfm]}
        components={{
          p: ({ children }) => <p className="text-sm leading-[1.7] text-foreground/90">{children}</p>,
          ul: ({ children }) => <ul className="text-sm leading-[1.7] space-y-1.5 pl-4 list-disc marker:text-amber/60 text-foreground/90">{children}</ul>,
          ol: ({ children }) => <ol className="text-sm leading-[1.7] space-y-1.5 pl-4 list-decimal marker:text-muted-foreground/60 text-foreground/90">{children}</ol>,
          li: ({ children, className }) => {
            // GFM task list items get className="task-list-item"
            if (className?.includes("task-list-item")) {
              return <li className="list-none -ml-4 flex items-start gap-2.5">{children}</li>;
            }
            return <li>{children}</li>;
          },
          input: ({ checked, ...rest }) => (
            <input
              {...rest}
              type="checkbox"
              checked={checked}
              readOnly
              className="mt-[0.3rem] size-4 accent-[oklch(0.78_0.15_60)] rounded border-line"
            />
          ),
          h1: ({ children }) => (
            <h3 className="text-lg font-medium mt-3 tracking-tight">
              {children}
            </h3>
          ),
          h2: ({ children }) => (
            <h4 className="text-base font-medium mt-3 tracking-tight">
              {children}
            </h4>
          ),
          h3: ({ children }) => (
            <h4 className="text-sm font-semibold mt-3 uppercase tracking-wider text-muted-foreground">{children}</h4>
          ),
          strong: ({ children }) => <strong className="font-semibold text-foreground">{children}</strong>,
          em: ({ children }) => (
            <em className="text-foreground/95">
              {children}
            </em>
          ),
          hr: () => <hr className="my-3 border-line" />,
          code: ({ children }) => (
            <code className="rounded bg-ink/[0.06] border border-line px-1.5 py-0.5 text-[0.82em] font-mono text-ink">
              {children}
            </code>
          ),
          a: ({ children, href }) => {
            if (href?.startsWith(MENTION_HREF_PREFIX)) {
              const isMe =
                currentUserId != null &&
                href.slice(MENTION_HREF_PREFIX.length) === currentUserId;
              return (
                <span
                  className={
                    isMe
                      ? "inline-flex items-center rounded-md bg-amber text-amber-ink px-1.5 py-px text-[0.85em] font-semibold"
                      : "inline-flex items-center rounded-md bg-amber/[0.12] text-amber px-1.5 py-px text-[0.85em] font-medium"
                  }
                >
                  {children}
                </span>
              );
            }
            return (
              <a
                href={href}
                target="_blank"
                rel="noopener noreferrer"
                className="underline underline-offset-2 hover:text-accent transition"
              >
                {children}
              </a>
            );
          },
          blockquote: ({ children }) => (
            <blockquote className="border-l-2 border-amber/40 pl-3 text-muted-foreground text-sm italic">
              {children}
            </blockquote>
          ),
        }}
      >
        {children}
      </ReactMarkdown>
    </div>
  );
}
