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
  checkoutHost: host => host === 'checkout.stripe.com',

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

  async verify({ providerRef, order }) {
    if (!providerRef || !/^cs_(test|live)_[A-Za-z0-9]+$/.test(providerRef)) return { status: 'pending' };
    const r = await fetch(`https://api.stripe.com/v1/checkout/sessions/${providerRef}`, {
      headers: { Authorization: `Bearer ${process.env.STRIPE_SECRET_KEY}` },
    });
    if (!r.ok) return { status: 'pending' };
    const data = await r.json();
    const amountMatches = Number(data.amount_total) === Math.round(Number(order?.amount) * 100);
    const currencyMatches = String(data.currency).toLowerCase() === String(order?.currency || 'USD').toLowerCase();
    const orderMatches = data.client_reference_id === order?.id && data.metadata?.orderId === order?.id;
    if (data.payment_status === 'paid' && data.status === 'complete' && data.mode === 'payment' && amountMatches && currencyMatches && orderMatches) return { status: 'paid' };
    if (data.payment_status === 'paid') return { status: 'pending', reason: 'Payment details do not match this order — access remains locked' };
    if (data.status === 'expired') return { status: 'failed' };
    return { status: 'pending' };
  },

  // Verifies the Stripe-Signature header per Stripe's documented scheme:
  // HMAC-SHA256(webhookSecret, `${timestamp}.${rawBody}`) must match v1.
  verifyWebhook(rawBody, signatureHeader) {
    if (!process.env.STRIPE_WEBHOOK_SECRET || !signatureHeader) return null;
    const parts = signatureHeader.split(',').reduce((all, p) => {const [k,v]=p.split('=');(all[k]??=[]).push(v);return all},{});
    const timestamp=Number(parts.t?.[0]), candidates=parts.v1||[];
    if (!Number.isFinite(timestamp) || Math.abs(Date.now()/1000-timestamp)>300 || !candidates.length) return null;
    const expected = crypto.createHmac('sha256', process.env.STRIPE_WEBHOOK_SECRET)
      .update(`${timestamp}.${rawBody}`).digest();
    const ok = candidates.some(value=>{if(!/^[a-f\d]{64}$/i.test(value))return false;const actual=Buffer.from(value,'hex');return actual.length===expected.length&&crypto.timingSafeEqual(expected,actual)});
    if (!ok) return null;
    try {
      const event = JSON.parse(rawBody);
      if(!['checkout.session.completed','checkout.session.async_payment_succeeded','checkout.session.async_payment_failed'].includes(event?.type))return null;
      return {orderId:event?.data?.object?.metadata?.orderId||event?.data?.object?.client_reference_id||null,type:event.type};
    } catch { return null; }
  },
};

// ============================== WHISH =======================================
// Fail closed until the merchant API contract is implemented and verified.
// Public-facing material is not a substitute for authenticated API specs.
const whish = {
  configured: () => false,
  reason: 'Merchant API details required',
};

export const providers = { stripe, whish };
