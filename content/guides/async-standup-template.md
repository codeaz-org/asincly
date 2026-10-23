---
title: Async standup template (with examples that actually get read)
description: A copy-paste async standup template for remote teams, with good and bad examples, and how to run it across time zones without a meeting.
date: 2026-10-27
---

An async standup replaces the daily meeting with a short written or recorded update each
person posts in their own working hours. It only works if the updates are quick to write
and quick to read. A template does most of that work.

Below is the template we use, why each part is there, and what good answers look like.

## The template

Copy this into Slack, a doc, or whatever tool your team uses:

```
Yesterday
- What I finished (link it if there's a PR, doc or ticket)
- What I started but didn't finish, and why

Today
- The one or two things I'll get done
- Anything I need from someone, with their name

Blockers
- What's stopping me, who can unblock it, since when
- "None" is a fine answer
```

Three sections, short bullets, names where someone else is involved. That's it.

## Why each part is there

**Yesterday** is the part nobody reads closely, so keep it to outcomes. "Finished the
invite flow (PR #212)" beats "worked on invites". Unfinished work matters more than
finished work: it's how the team spots drift early.

**Today** is the commitment. One or two items keeps it honest. Tomorrow, "Yesterday"
should match today's "Today"; when it doesn't, that's worth a sentence.

**Blockers** is the only section that needs action from others. Name the person who can
help and say how long it's been stuck. A blocker without an owner sits there until the
next meeting, which is what you were trying to get rid of.

## Good and bad examples

Bad:

```
Yesterday: meetings, some bug fixes
Today: more bug fixes
Blockers: none
```

Nothing here helps a teammate decide anything.

Good:

```
Yesterday
- Shipped CSV export for teams (PR #231)
- Started the retention setting; schema done, UI not started (got pulled into the billing bug)

Today
- Finish retention setting UI
- Pair with @Priya on the billing webhook retry

Blockers
- Waiting on staging DB access since Tuesday, @Marco can grant it
```

A reader in another time zone knows what moved, what's next, and who needs to act.

## Running it across time zones

The point of async is that nobody has to be awake at the same time. A few rules make it
work when your team spans Europe, the Americas and Asia:

- **Give each person a window in their own morning**, not one global deadline. A 10:00
  deadline in New York is 23:00 in Tokyo.
- **Read in your own morning, too.** Check updates once, at the start of your day. Reply
  in threads, not in new messages.
- **Make blockers loud.** Tag the person who can help. Everything else can wait for the
  next read.
- **Keep it to two minutes.** If an update takes longer to write than that, the template
  is too big.

## Written or video?

Written updates are easy to scan but people under-explain. Short videos carry more
context, but nobody wants to watch twelve of them. A middle ground is to record a quick
video and turn it into the written template above, so teammates read the summary and
only watch when they need detail.

That's what we built [Asincly](/?utm_source=guide&utm_medium=organic&utm_content=async-standup-template)
for: each person records about two minutes in their own morning, AI drafts the
yesterday / today / blockers note from it (ticking off yesterday's plan and tagging the
teammates you mention), and you edit and send. It's open source and free for teams of up
to three. You can [try it here](/sign-in?utm_source=guide&utm_medium=organic&utm_content=async-standup-template)
or use the template above in any tool. The template is what matters.
