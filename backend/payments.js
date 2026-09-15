import crypto from 'node:crypto';

// ---------------------------------------------------------------------------
// Payment provider adapters.
//
// Every adapter exposes the same three functions:
//   configured()                          -> true once its API keys are set
//   createCheckout({orderId, amount, currency, description, customer})
//                                          -> { checkoutUrl, providerRef }
//   verify({ providerRef })               -> { status: 'paid' | 'pending' | 'failed' }
//
// IMPORTANT: neither adapter ever sees a card number. Each one asks the
// provider for a hosted payment page and returns a URL; the browser is
// redirected there and the client enters their card on the PROVIDER'S
// page, exactly like the "Pay with card" flow on Netflix or ChatGPT.
// This server only ever asks the provider afterwards: "did this succeed?"
// and treats that answer, not anything the browser reports, as the truth.
// ---------------------------------------------------------------------------

const origin = () => (process.env.APP_ORIGIN || 'http://127.0.0.1:5173').replace(/\/$/, '');

// ============================== STRIPE ======================================
// Real, stable Stripe Checkout Sessions REST API. Needs STRIPE_SECRET_KEY.
// To verify webhooks, also set STRIPE_WEBHOOK_SECRET (from the Stripe
// dashboard once you add the endpoint https://yourdomain/api/webhooks/stripe).
const stripe = {
  configured: () => Boolean(process.env.STRIPE_SECRET_KEY),

  async createCheckout({ orderId, amount, currency, description, customer }) {
    const body = new URLSearchParams({
      mode: 'payment',
      success_url: `${origin()}/payment/return?provider=stripe&order=${orderId}`,
      cancel_url: `${origin()}/payment/return?provider=stripe&order=${orderId}&cancelled=1`,
      client_reference_id: orderId,
      customer_email: customer?.email || '',
      'line_items[0][quantity]': '1',
      'line_items[0][price_data][currency]': currency.toLowerCase(),
      'line_items[0][price_data][unit_amount]': String(Math.round(amount * 100)),
      'line_items[0][price_data][product_data][name]': description,
      'metadata[orderId]': orderId,
    });
    const r = await fetch('https://api.stripe.com/v1/checkout/sessions', {
      method: 'POST',
      headers: {
        Authorization: `Bearer ${process.env.STRIPE_SECRET_KEY}`,
        'Content-Type': 'application/x-www-form-urlencoded',
      },
      body,
    });
    const data = await r.json();
    if (!r.ok) throw new Error(data.error?.message || 'Stripe could not start checkout.');
    return { checkoutUrl: data.url, providerRef: data.id };
  },

  async verify({ providerRef }) {
    const r = await fetch(`https://api.stripe.com/v1/checkout/sessions/${providerRef}`, {
      headers: { Authorization: `Bearer ${process.env.STRIPE_SECRET_KEY}` },
    });
    if (!r.ok) return { status: 'pending' };
    const data = await r.json();
    if (data.payment_status === 'paid') return { status: 'paid' };
    if (data.status === 'expired') return { status: 'failed' };
    return { status: 'pending' };
  },

  // Verifies the Stripe-Signature header per Stripe's documented scheme:
  // HMAC-SHA256(webhookSecret, `${timestamp}.${rawBody}`) must match v1.
  verifyWebhook(rawBody, signatureHeader) {
    if (!process.env.STRIPE_WEBHOOK_SECRET || !signatureHeader) return null;
    const parts = Object.fromEntries(signatureHeader.split(',').map(p => p.split('=')));
    if (!parts.t || !parts.v1) return null;
    const expected = crypto.createHmac('sha256', process.env.STRIPE_WEBHOOK_SECRET)
      .update(`${parts.t}.${rawBody}`).digest('hex');
    const ok = expected.length === parts.v1.length &&
      crypto.timingSafeEqual(Buffer.from(expected), Buffer.from(parts.v1));
    if (!ok) return null;
    try {
      const event = JSON.parse(rawBody);
      return event?.data?.object?.metadata?.orderId || event?.data?.object?.client_reference_id || null;
    } catch { return null; }
  },
};

// ============================== WHISH =======================================
// Whish Pay's merchant "Collect" web service returns a hosted URL where the
// client fills in card / Whish wallet details, then exposes a status
// endpoint you poll with your channel + secret.
//
// *** You don't have Whish merchant credentials yet. ***
// The exact endpoint paths and field names below are our best-documented
// placeholder based on Whish's public "Collect" service description, and
// MUST be confirmed against the technical spec Whish gives you when you
// sign up as a merchant (ask for their "Web Service Technical
// Specification" PDF). Until WHISH_SECRET is set, this adapter simply
// reports itself as not configured, so the payment option stays hidden
// rather than silently failing. Update the two fetch() calls below with
// the real paths once you have them — everything else (order creation,
// auto-grant, notifications) already works against whatever this adapter
// returns.
const whish = {
  configured: () => Boolean(process.env.WHISH_CHANNEL && process.env.WHISH_SECRET),

  async createCheckout({ orderId, amount, currency, description, customer }) {
    const base = process.env.WHISH_BASE_URL || 'https://whish.money/itmpapi'; // TODO confirm with Whish
    const r = await fetch(`${base}/payment/collect`, { // TODO confirm exact path
      method: 'POST',
      headers: {
        'Content-Type': 'application/json',
        channel: process.env.WHISH_CHANNEL,
        secret: process.env.WHISH_SECRET,
      },
      body: JSON.stringify({
        amount,
        currency, // 'USD' or 'LBP'
        invoice: description,
        externalId: orderId,
        successCallbackUrl: `${origin()}/payment/return?provider=whish&order=${orderId}`,
        failureCallbackUrl: `${origin()}/payment/return?provider=whish&order=${orderId}&cancelled=1`,
        successRedirectUrl: `${origin()}/payment/return?provider=whish&order=${orderId}`,
        failureRedirectUrl: `${origin()}/payment/return?provider=whish&order=${orderId}&cancelled=1`,
        customerName: customer?.name || '',
      }),
    });
    const data = await r.json().catch(() => ({}));
    if (!r.ok || !data.collectUrl) throw new Error(data.message || 'Whish could not start checkout.');
    return { checkoutUrl: data.collectUrl, providerRef: orderId }; // Whish keys status lookups by externalId
  },

  async verify({ providerRef }) {
    const base = process.env.WHISH_BASE_URL || 'https://whish.money/itmpapi';
    const r = await fetch(`${base}/payment/collect/status`, { // TODO confirm exact path
      method: 'POST',
      headers: {
        'Content-Type': 'application/json',
        channel: process.env.WHISH_CHANNEL,
        secret: process.env.WHISH_SECRET,
      },
      body: JSON.stringify({ externalId: providerRef }),
    });
    if (!r.ok) return { status: 'pending' };
    const data = await r.json().catch(() => ({}));
    if (data.collectStatus === 'success') return { status: 'paid' };
    if (['failed', 'declined', 'expired'].includes(data.collectStatus)) return { status: 'failed' };
    return { status: 'pending' };
  },
};

export const providers = { stripe, whish };
