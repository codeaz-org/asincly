---
title: How to run standups across time zones
description: A practical way to run daily standups for a team spread over 3+ time zones without anyone joining at midnight. Windows, formats and DST pitfalls.
date: 2026-10-26
keywords: standup across time zones, distributed team standup, async daily standup, remote team check-in
---

A daily standup works when everyone is awake and focused at the same moment. On a team spread
over three or more time zones that moment does not exist. A 09:30 call in New York is 15:30
in Berlin and 22:30 in Tokyo, so someone is always early, late or asleep.

This guide covers what actually works for distributed teams, in order of how much it changes.

## Option 1: Find the least bad hour

Pick one slot and rotate who takes the bad end. It is cheap and keeps the live meeting. It
stops working once the spread is more than about eight hours, because the "bad end" becomes
the same people every week unless you rotate on purpose.

Rules that help:

- Rotate the pain on a fixed calendar, not by who complains.
- Keep the call to 15 minutes and record it, so the people who missed it can catch up.
- Never schedule it outside 07:00 to 21:00 for anyone, even once.

## Option 2: Split into regional standups

Run one standup per region and post a short summary between them. Each group stays in
business hours. The cost is a handoff: whatever the Europe call learns has to reach the
Americas call, and that handoff is where blockers get lost.

If you do this, assign one person per region to write the summary and put blockers at the top.

## Option 3: Make the standup asynchronous

Drop the shared time. Each person posts an update during their own morning, and everyone
reads the others' updates during theirs. Nobody waits for anybody.

There are three common formats:

| Format | Good for | Weak spot |
|---|---|---|
| Written, in a chat thread or bot | Teams that like text; quick to read | Answers shrink to "same as yesterday" |
| Short video | Context, tone, screen demos | Hard to scan; twelve videos is a lot |
| Video plus a written summary | Richer answers with fast reading | Needs a tool or a person to summarise |

Whichever format you pick, keep the same three questions: what did you finish, what are you
doing next, what is blocking you. Add one rule: a blocker needs a named person or it will sit.

## The part teams forget: daylight saving time

Clocks change on different dates in different places. In 2026 Europe moves its clocks back
on 25 October and the US follows on 1 November. For that week a New York to London meeting
is an hour off from what everyone expects. Southern hemisphere teams move in the opposite
direction in the spring.

Two practical fixes:

1. Schedule in each person's local time, not in UTC offsets you typed once. Calendars and
   tools that store an IANA time zone (for example `Europe/Berlin`) handle this correctly;
   a hard-coded "UTC+1" does not.
2. For async standups, define a window ("08:00 to 11:00 local") instead of a fixed time. A
   one-hour shift then changes nothing.

## A simple async setup you can start this week

1. Choose the window: each person posts any time between 08:00 and 11:00 local time.
2. Choose the format: three questions, text or two-minute video.
3. Set one reading habit: everyone reads the team's updates once, early in their day.
4. Handle blockers separately: a blocker gets a reply from a named person within one working
   day, and the person who raised it marks it resolved.
5. Review after two weeks. Ask if anyone had to be awake at a bad hour, and whether any
   blocker waited more than a day.

If you want a ready-made list of questions, see the
[async standup template](/guides/async-standup-template).

## When a live standup is still the right call

Async is not for everyone. If your team sits in one or two adjacent time zones and the
daily call takes ten minutes and works, keep it. Async helps when the meeting time is the
problem, not when the team simply dislikes meetings.

## Where Asincly fits

I am the maker of Asincly, so weigh this accordingly. It is built for the third option:
each person records about two minutes of camera and screen in their own check-in window,
AI drafts yesterday / today / blockers, and teammates read one summary screen and open the
video only when needed. Windows follow each member's local time zone and handle daylight
saving changes. It is open source (AGPL-3.0), self-hostable, and free for teams of up to three.

[Try Asincly free](/sign-in?utm_source=guide&utm_medium=organic&utm_content=standup-across-time-zones)
or read the [source and self-hosting docs](https://github.com/codeaz-org/asincly).
