"use client";

import { useEffect, useId, useState, useTransition } from "react";
import { useRouter } from "next/navigation";
import { MarkLoader } from "@/components/brand/loader";
import { Button } from "@/components/ui/button";
import { fieldClass } from "@/components/ui/field";
import { disconnectSlack, getSlackChannels, sendSlackTest, updateSlackSettings } from "@/lib/actions/slack";
import type { SlackChannel } from "@/lib/slack/api";

type Props = {
  teamId: string;
  workspace: string;
  channelId: string | null;
  channelName: string | null;
  digestEnabled: boolean;
  remindersEnabled: boolean;
};

export function SlackSettings(props: Props) {
  const router = useRouter();
  const [channels, setChannels] = useState<SlackChannel[] | null>(null);
  const [channelId, setChannelId] = useState(props.channelId);
  const [digest, setDigest] = useState(props.digestEnabled);
  const [reminders, setReminders] = useState(props.remindersEnabled);
  const [message, setMessage] = useState<{ tone: "ok" | "error"; text: string } | null>(null);
  const [pending, start] = useTransition();
  const selectId = useId();

  useEffect(() => {
    let live = true;
    getSlackChannels({ teamId: props.teamId }).then((res) => {
      if (!live) return;
      if (res.ok) setChannels(res.channels);
      else setMessage({ tone: "error", text: res.error });
    });
    return () => {
      live = false;
    };
  }, [props.teamId]);

  const save = () =>
    start(async () => {
      setMessage(null);
      const res = await updateSlackSettings({
        teamId: props.teamId,
        channelId,
        digestEnabled: digest,
        remindersEnabled: reminders,
      });
      setMessage(res.ok ? { tone: "ok", text: "Saved." } : { tone: "error", text: res.error });
      if (res.ok) router.refresh();
    });

  return (
    <div className="space-y-5">
      <div className="space-y-2">
        <label htmlFor={selectId} className="kicker block">
          Digest channel
        </label>
        {channels ? (
          <select
            id={selectId}
            value={channelId ?? ""}
            onChange={(e) => setChannelId(e.target.value || null)}
            className={`${fieldClass} h-11`}
          >
            <option value="">No channel</option>
            {channels.map((c) => (
              <option key={c.id} value={c.id}>
                {c.isPrivate ? "🔒 " : "#"}
                {c.name}
              </option>
            ))}
          </select>
        ) : (
          <MarkLoader size="xs" label="Loading channels" />
        )}
        <p className="text-xs text-soft">Private channels show up after you invite the app with /invite @Asincly.</p>
      </div>

      <Toggle
        label="Post the daily digest"
        hint="Who's in, their plan for today and open blockers, once everyone's window has closed."
        checked={digest}
        onChange={setDigest}
      />
      <Toggle
        label="Remind people by DM"
        hint="When someone's check-in window opens. Matched by email address."
        checked={reminders}
        onChange={setReminders}
      />

      <div className="flex flex-wrap items-center gap-2">
        <Button variant="primary" onClick={save} disabled={pending}>
          Save
        </Button>
        <Button
          disabled={pending || !props.channelId}
          onClick={() =>
            start(async () => {
              const res = await sendSlackTest({ teamId: props.teamId });
              setMessage(
                res.ok
                  ? { tone: "ok", text: `Test message sent to #${props.channelName}.` }
                  : { tone: "error", text: res.error },
              );
            })
          }
        >
          Send a test
        </Button>
        <span className="flex-1" />
        <Button
          variant="quiet"
          disabled={pending}
          className="text-danger/80 hover:text-danger"
          onClick={() =>
            start(async () => {
              await disconnectSlack({ teamId: props.teamId });
              router.refresh();
            })
          }
        >
          Disconnect {props.workspace}
        </Button>
      </div>
      {message && (
        <p role={message.tone === "error" ? "alert" : "status"} className={message.tone === "error" ? "text-sm text-danger" : "text-sm text-soft"}>
          {message.text}
        </p>
      )}
    </div>
  );
}

function Toggle({
  label,
  hint,
  checked,
  onChange,
}: {
  label: string;
  hint: string;
  checked: boolean;
  onChange: (v: boolean) => void;
}) {
  return (
    <label className="flex items-center justify-between gap-4 rounded-xl border border-line px-4 py-3 cursor-pointer">
      <span className="text-sm">
        <span className="block font-medium text-ink">{label}</span>
        <span className="block text-soft">{hint}</span>
      </span>
      <input
        type="checkbox"
        checked={checked}
        onChange={(e) => onChange(e.target.checked)}
        className="size-5 accent-[oklch(0.78_0.15_60)]"
      />
    </label>
  );
}
