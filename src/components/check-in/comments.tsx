"use client";

import { useState, useTransition } from "react";
import { Send, Trash2 } from "lucide-react";
import { MarkLoader } from "@/components/brand/loader";
import { ReactionBar } from "@/components/emoji/reaction-bar";
import { MentionTextarea } from "@/components/mention-textarea";
import { Avatar } from "@/components/ui/avatar";
import { Button } from "@/components/ui/button";
import { addComment, deleteComment } from "@/lib/actions/social";
import { displayName } from "@/lib/display";
import type { ReactionSummary } from "@/lib/queries";
import { COMMENT_MAX } from "@/lib/validation/social";

export type ThreadComment = {
  id: string;
  userId: string;
  userName: string | null;
  userEmail: string;
  body: string;
  createdAt: string;
  deleted: boolean;
  reactions: ReactionSummary[];
};

export function Comments({
  checkInId,
  viewerId,
  comments,
}: {
  checkInId: string;
  viewerId: string;
  comments: ThreadComment[];
}) {
  const [body, setBody] = useState("");
  const [error, setError] = useState<string | null>(null);
  const [pending, startTransition] = useTransition();

  function submit() {
    if (!body.trim()) return;
    setError(null);
    startTransition(async () => {
      const res = await addComment({ checkInId, body });
      if (res.ok) setBody("");
      else setError(res.error);
    });
  }

  return (
    <div className="space-y-5">
      {comments.length === 0 ? (
        <p className="text-sm text-soft">No replies yet. Ask a question, cheer a win, offer a hand.</p>
      ) : (
        <ol className="space-y-4">
          {comments.map((c) => (
            <li key={c.id} className="flex gap-3 animate-rise-in">
              <Avatar name={c.userName} email={c.userEmail} size={32} />
              <div className="flex-1 min-w-0">
                <p className="text-sm">
                  <span className="font-medium text-ink">{displayName(c.userName, c.userEmail)}</span>
                  {/* Server and browser format in different time zones; the browser's wins. */}
                  <time className="ml-2 text-xs text-faint" dateTime={c.createdAt} suppressHydrationWarning>
                    {new Date(c.createdAt).toLocaleString([], { hour: "2-digit", minute: "2-digit", day: "numeric", month: "short" })}
                  </time>
                </p>
                {c.deleted ? (
                  <p className="text-sm text-faint italic">Comment removed</p>
                ) : (
                  <>
                    <p className="text-[15px] text-ink whitespace-pre-wrap break-words leading-relaxed">{c.body}</p>
                    <ReactionBar checkInId={checkInId} commentId={c.id} initial={c.reactions} size="sm" className="mt-1.5" />
                  </>
                )}
              </div>
              {c.userId === viewerId && !c.deleted && (
                <Button
                  variant="ghost"
                  size="icon-sm"
                  aria-label="Delete comment"
                  className="hover:text-danger"
                  onClick={() =>
                    startTransition(async () => {
                      const res = await deleteComment({ commentId: c.id });
                      if (!res.ok) setError(res.error);
                    })
                  }
                >
                  <Trash2 />
                </Button>
              )}
            </li>
          ))}
        </ol>
      )}

      <form
        onSubmit={(e) => {
          e.preventDefault();
          submit();
        }}
        className="rounded-2xl border border-line bg-ink/[0.03] focus-within:border-amber/50 transition"
      >
        <label htmlFor="reply" className="sr-only">
          Write a reply
        </label>
        <MentionTextarea
          id="reply"
          value={body}
          onChange={setBody}
          candidates={[]}
          onKeyDown={(e) => {
            if ((e.metaKey || e.ctrlKey) && e.key === "Enter") {
              e.preventDefault();
              submit();
            }
          }}
          maxLength={COMMENT_MAX}
          rows={2}
          placeholder="Write a reply… (:emoji: works)"
          className="block w-full resize-none bg-transparent px-4 pt-3 text-[15px] text-ink placeholder:text-faint focus:outline-none"
        />
        <div className="flex items-center justify-between gap-3 px-3 pb-3">
          <span className="text-[11px] text-faint">{body.length > COMMENT_MAX - 200 ? `${COMMENT_MAX - body.length} left` : "⌘↵ to send"}</span>
          <Button type="submit" variant="primary" size="sm" disabled={pending || !body.trim()}>
            {pending ? <MarkLoader size="xs" /> : <Send />}
            Reply
          </Button>
        </div>
      </form>
      {error && (
        <p role="alert" className="text-sm text-danger">
          {error}
        </p>
      )}
    </div>
  );
}
