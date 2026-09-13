import Stripe from "stripe";
import { STRIPE_LOOKUP_KEYS } from "@/lib/billing/plans";
import type { BillingInterval } from "@/lib/validation/billing";

// One Stripe client for the process. Use a restricted key (rk_…) with write
// access to Checkout Sessions, Customers, Subscriptions and Billing Portal,
// and read access to Prices.

let client: Stripe | null = null;

export function stripeConfigured(): boolean {
  return !!process.env.STRIPE_SECRET_KEY;
}

export function getStripe(): Stripe {
  const key = process.env.STRIPE_SECRET_KEY;
  if (!key) throw new Error("Stripe is not configured (STRIPE_SECRET_KEY)");
  client ??= new Stripe(key, { appInfo: { name: "Asincly", url: "https://github.com/codeaz-org/asincly" } });
  return client;
}

// Price ids come from env when set, otherwise from the lookup keys created by
// scripts/stripe-setup.mjs.
const priceCache = new Map<BillingInterval, string>();

export async function priceIdFor(interval: BillingInterval): Promise<string> {
  const fromEnv = interval === "month" ? process.env.STRIPE_PRICE_MONTHLY : process.env.STRIPE_PRICE_YEARLY;
  if (fromEnv) return fromEnv;
  const cached = priceCache.get(interval);
  if (cached) return cached;
  const prices = await getStripe().prices.list({ lookup_keys: [STRIPE_LOOKUP_KEYS[interval]], active: true, limit: 1 });
  const id = prices.data[0]?.id;
  if (!id) throw new Error(`No Stripe price for ${interval}; run scripts/stripe-setup.mjs`);
  priceCache.set(interval, id);
  return id;
}

// Stripe Tax stays off until the business has active tax registrations:
// with automatic_tax on and no registration Stripe silently collects nothing.
export function stripeTaxEnabled(): boolean {
  return process.env.STRIPE_TAX_ENABLED === "true";
}

export function integrationIdentifier(): string {
  const letters = Array.from({ length: 8 }, () => String.fromCharCode(97 + Math.floor(Math.random() * 26))).join("");
  return `asincly-pro-${letters}`;
}
