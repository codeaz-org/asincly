import ReactMarkdown from "react-markdown";
import remarkGfm from "remark-gfm";

// Tight markdown block for check-in body. GFM enables task lists.
// Sanitization is on by default in react-markdown (no raw HTML).
export function Markdown({ children }: { children: string }) {
  if (!children.trim()) {
    return <p className="text-sm text-muted-foreground/50 italic">Empty.</p>;
  }
  return (
    <div className="prose-tight">
      <ReactMarkdown
        remarkPlugins={[remarkGfm]}
        components={{
          p: ({ children }) => <p className="text-sm leading-relaxed">{children}</p>,
          ul: ({ children }) => <ul className="text-sm space-y-1 pl-4 list-disc marker:text-muted-foreground/40">{children}</ul>,
          ol: ({ children }) => <ol className="text-sm space-y-1 pl-4 list-decimal marker:text-muted-foreground/40">{children}</ol>,
          li: ({ children, className }) => {
            // GFM task list items get className="task-list-item"
            if (className?.includes("task-list-item")) {
              return <li className="list-none -ml-4 flex items-start gap-2">{children}</li>;
            }
            return <li>{children}</li>;
          },
          input: ({ checked, ...rest }) => (
            <input
              {...rest}
              type="checkbox"
              checked={checked}
              readOnly
              className="mt-1 size-3.5 accent-emerald-400 rounded border-white/20"
            />
          ),
          h1: ({ children }) => <h3 className="text-base font-medium mt-3">{children}</h3>,
          h2: ({ children }) => <h4 className="text-sm font-medium mt-3">{children}</h4>,
          h3: ({ children }) => <h4 className="text-sm font-medium mt-3">{children}</h4>,
          code: ({ children }) => (
            <code className="rounded bg-white/[0.06] px-1.5 py-0.5 text-[0.85em] font-mono">
              {children}
            </code>
          ),
          a: ({ children, href }) => (
            <a
              href={href}
              target="_blank"
              rel="noopener noreferrer"
              className="underline underline-offset-2 hover:text-accent transition"
            >
              {children}
            </a>
          ),
          blockquote: ({ children }) => (
            <blockquote className="border-l-2 border-white/10 pl-3 text-muted-foreground text-sm">
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
