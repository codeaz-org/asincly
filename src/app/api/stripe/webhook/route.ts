import { NextResponse } from "next/server";
import { isBillingEnabled } from "@/lib/billing/plans";
import { getStripe } from "@/lib/billing/stripe";
import { handleStripeEvent } from "@/lib/billing/webhook";
import { rateLimit } from "@/lib/rate-limit";

export const dynamic = "force-dynamic";

// Stripe → Asincly. The raw body is required for signature verification, so
// read it as text before anything parses it.
export async function POST(req: Request) {
  const secret = process.env.STRIPE_WEBHOOK_SECRET;
  if (!isBillingEnabled() || !secret) {
    return NextResponse.json({ ok: false, error: "billing disabled" }, { status: 404 });
  }
  const ip = req.headers.get("x-forwarded-for")?.split(",")[0]?.trim() ?? "unknown";
  if (!rateLimit(`stripe-webhook:${ip}`, 300, 60_000).allowed) {
    return NextResponse.json({ ok: false, error: "rate limited" }, { status: 429 });
  }

  const signature = req.headers.get("stripe-signature");
  if (!signature) return NextResponse.json({ ok: false, error: "missing signature" }, { status: 400 });
  const body = await req.text();

  let event;
  try {
    event = getStripe().webhooks.constructEvent(body, signature, secret);
  } catch {
    return NextResponse.json({ ok: false, error: "invalid signature" }, { status: 400 });
  }

  try {
    const fresh = await handleStripeEvent(event);
    return NextResponse.json({ ok: true, duplicate: !fresh });
  } catch (e) {
    console.error("[stripe] webhook handler failed", { id: event.id, type: event.type, error: (e as Error).message });
    return NextResponse.json({ ok: false }, { status: 500 });
  }
}
