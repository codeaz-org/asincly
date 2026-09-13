#!/usr/bin/env node
// Creates the Asincly Pro catalog in Stripe. Safe to re-run: prices are found
// by lookup key and only created when missing.
//
//   STRIPE_SECRET_KEY=sk_test_... node scripts/stripe-setup.mjs
//   node scripts/stripe-setup.mjs --tax-behavior=inclusive   (default: exclusive)
//
// Prints the price ids for STRIPE_PRICE_MONTHLY / STRIPE_PRICE_YEARLY.
// Prices and the tax code below mirror src/lib/billing/plans.ts.
import "dotenv/config";
import Stripe from "stripe";

const key = process.env.STRIPE_SECRET_KEY;
if (!key) {
  console.error("STRIPE_SECRET_KEY is required (use a test-mode or sandbox key first).");
  process.exit(1);
}
const stripe = new Stripe(key);

const CURRENCY = "eur";
const PRODUCT_ID = "asincly_pro";
// Software as a service, business use. Confirm against
// https://docs.stripe.com/tax/tax-codes before enabling Stripe Tax.
const TAX_CODE = "txcd_10103001";
const taxBehaviorArg = process.argv.find((a) => a.startsWith("--tax-behavior="));
const TAX_BEHAVIOR = taxBehaviorArg ? taxBehaviorArg.split("=")[1] : "exclusive";
if (!["exclusive", "inclusive"].includes(TAX_BEHAVIOR)) {
  console.error("--tax-behavior must be exclusive or inclusive");
  process.exit(1);
}

const PRICES = [
  { lookup_key: "asincly_pro_member_monthly", interval: "month", unit_amount: 800, nickname: "Pro, per member, monthly" },
  { lookup_key: "asincly_pro_member_yearly", interval: "year", unit_amount: 8000, nickname: "Pro, per member, yearly" },
];

async function ensureProduct() {
  try {
    return await stripe.products.retrieve(PRODUCT_ID);
  } catch (e) {
    if (e?.statusCode !== 404) throw e;
    return stripe.products.create({
      id: PRODUCT_ID,
      name: "Asincly Pro",
      description: "Async standups for remote teams. Billed per member.",
      tax_code: TAX_CODE,
      unit_label: "member",
    });
  }
}

async function ensurePrice(product, p) {
  const found = await stripe.prices.list({ lookup_keys: [p.lookup_key], active: true, limit: 1 });
  if (found.data[0]) return { price: found.data[0], created: false };
  const price = await stripe.prices.create({
    product: product.id,
    currency: CURRENCY,
    unit_amount: p.unit_amount,
    recurring: { interval: p.interval, usage_type: "licensed" },
    lookup_key: p.lookup_key,
    nickname: p.nickname,
    tax_behavior: TAX_BEHAVIOR,
  });
  return { price, created: true };
}

async function ensurePortal(prices) {
  const existing = await stripe.billingPortal.configurations.list({ is_default: true, active: true, limit: 1 });
  if (existing.data[0]) return { created: false };
  await stripe.billingPortal.configurations.create({
    business_profile: { headline: "Manage your Asincly subscription" },
    features: {
      invoice_history: { enabled: true },
      payment_method_update: { enabled: true },
      customer_update: { enabled: true, allowed_updates: ["name", "email", "address", "tax_id"] },
      // Seats follow membership in the app, so customers only switch interval.
      subscription_update: {
        enabled: true,
        default_allowed_updates: ["price"],
        proration_behavior: "create_prorations",
        products: [{ product: PRODUCT_ID, prices: prices.map((p) => p.id) }],
      },
      subscription_cancel: { enabled: true, mode: "at_period_end" },
    },
  });
  return { created: true };
}

const product = await ensureProduct();
const results = [];
for (const p of PRICES) results.push({ ...p, ...(await ensurePrice(product, p)) });
const portal = await ensurePortal(results.map((r) => r.price));

console.log(`Product ${product.id}`);
for (const r of results) console.log(`  ${r.created ? "created" : "exists "} ${r.lookup_key} → ${r.price.id}`);
console.log(`Customer portal: ${portal.created ? "default configuration created" : "default configuration exists"}`);
console.log("\nAdd to your environment:");
console.log(`STRIPE_PRICE_MONTHLY=${results[0].price.id}`);
console.log(`STRIPE_PRICE_YEARLY=${results[1].price.id}`);
