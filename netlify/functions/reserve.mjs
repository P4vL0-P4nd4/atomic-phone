// POST /api/reserve  { model: 'one'|'s'|'xs', colorway, storage }
//
// Netlify Function (Functions 2.0 — web-standard Request/Response) for phone.atomicai.ch.
// Creates a Stripe Checkout Session for the FLAT, REFUNDABLE reservation deposit of the
// chosen model. Colorway + storage never change the amount — they are recorded in metadata
// (and the expected retail price is shown at checkout) so the reservation is fully described
// in the Stripe Dashboard.
//
// Only the three deposit Price IDs are ever charged. The per-SKU full-price IDs live in
// index.html (SKU_PRICE_IDS) for reference; they are NOT used by this version.
//
// Env (Netlify → Site configuration → Environment variables):
//   STRIPE_KEY   sk_live_… / sk_test_…   (secret)
//   APP_ORIGIN   https://phone.atomicai.ch   (optional; falls back to Netlify's URL, then the request origin)

export const config = { path: '/api/reserve' };

const DEPOSITS = {
  one: { name: 'Atomic Phone One',    priceId: 'price_1U78rwEhCuxRDC5VSedpTjPz', chf: 50 },
  s:   { name: 'Atomic Phone One S',  priceId: 'price_1U78unEhCuxRDC5Vu8cElw4k', chf: 35 },
  xs:  { name: 'Atomic Phone One XS', priceId: 'price_1UEAhlEhCuxRDC5ViWumXN7a', chf: 25 },
};
const COLORWAYS = {
  one: ['black-turquoise', 'white-pink', 'white-black', 'black-white', 'black-red', 'gold-green'],
  s:   ['black-turquoise', 'white-black', 'white-pink'],
  xs:  ['black-turquoise', 'white-black', 'white-pink'],
};
const PRICES = {   // expected retail price, CHF — display/metadata only
  one: { 256: 1299, 512: 1399, 1024: 1499, 2048: 1599 },
  s:   { 128: 899,  256: 949,  512: 999,   1024: 1099 },
  xs:  { 128: 599,  256: 699,  512: 799 },
};
const CW_NAMES = { 'black-turquoise': 'Black / Turquoise', 'white-pink': 'White / Pink', 'white-black': 'White / Black', 'black-white': 'Black / White', 'black-red': 'Black / Red', 'gold-green': 'Limited Edition Gold / Green' };
const fmtStorage = gb => gb >= 1024 ? (gb / 1024) + ' TB' : gb + ' GB';

const DISCLOSURE = 'Atomic Phone is in active development and the release date has not been finalized. ' +
  'This is a fully refundable reservation deposit — you are not charged the full price today. ' +
  'To request a refund at any time, contact pavlo@atomicai.ch.';

const json = (body, status = 200, extra = {}) => new Response(JSON.stringify(body), {
  status, headers: { 'Content-Type': 'application/json; charset=utf-8', 'Cache-Control': 'no-store', ...extra },
});
const env = key => (globalThis.Netlify && Netlify.env && Netlify.env.get(key)) || process.env[key] || '';

export default async (request) => {
  if (request.method === 'OPTIONS') return new Response(null, { status: 204, headers: { 'Allow': 'POST, OPTIONS' } });
  if (request.method !== 'POST') return json({ ok: false, error: 'method_not_allowed', usage: 'POST {model, colorway, storage}' }, 405, { 'Allow': 'POST, OPTIONS' });

  const body = await request.json().catch(() => ({}));
  const model = String(body.model || '');
  const colorway = String(body.colorway || '');
  const storage = Number(body.storage || 0);

  const dep = DEPOSITS[model];
  if (!dep) return json({ ok: false, error: 'bad_model' }, 400);
  if (!COLORWAYS[model].includes(colorway)) return json({ ok: false, error: 'bad_colorway' }, 400);
  if (!PRICES[model][storage]) return json({ ok: false, error: 'bad_storage' }, 400);
  const STRIPE_KEY = env('STRIPE_KEY');
  if (!STRIPE_KEY) return json({ ok: false, error: 'stripe_unconfigured' }, 503);

  const origin = env('APP_ORIGIN') || env('URL') || new URL(request.url).origin;
  const expected = PRICES[model][storage];
  const configLine = `${dep.name} · ${CW_NAMES[colorway]} · ${fmtStorage(storage)}`;

  const form = new URLSearchParams();
  form.set('mode', 'payment');
  form.set('line_items[0][price]', dep.priceId);         // flat deposit — the ONLY thing charged
  form.set('line_items[0][quantity]', '1');
  form.set('success_url', `${origin}/?reserved=success&session_id={CHECKOUT_SESSION_ID}#reserve`);
  form.set('cancel_url', `${origin}/?reserved=cancel#reserve`);
  form.set('customer_creation', 'always');               // a Customer record makes refunds one click in the Dashboard
  form.set('client_reference_id', `atomic-phone-${model}-${colorway}-${storage}`);
  form.set('payment_intent_data[description]', `${dep.name} reservation deposit (refundable) — ${CW_NAMES[colorway]}, ${fmtStorage(storage)}`);
  form.set('custom_text[submit][message]', `${DISCLOSURE} Reserved configuration: ${configLine}. Expected retail price: CHF ${expected.toLocaleString('en-US')}.`);
  form.set('metadata[product]', 'atomic-phone-reservation');
  form.set('metadata[model]', model);
  form.set('metadata[model_name]', dep.name);
  form.set('metadata[colorway]', colorway);
  form.set('metadata[colorway_name]', CW_NAMES[colorway]);
  form.set('metadata[storage_gb]', String(storage));
  form.set('metadata[expected_price_chf]', String(expected));
  form.set('metadata[deposit_chf]', String(dep.chf));
  form.set('metadata[refundable]', 'yes — contact pavlo@atomicai.ch');
  form.set('metadata[release_date]', 'TBD');

  const sres = await fetch('https://api.stripe.com/v1/checkout/sessions', {
    method: 'POST',
    headers: { 'Authorization': `Bearer ${STRIPE_KEY}`, 'Content-Type': 'application/x-www-form-urlencoded' },
    body: form.toString(),
  });
  const session = await sres.json().catch(() => ({}));
  if (!sres.ok || !session.url) {
    return json({ ok: false, error: 'stripe_error', detail: session.error && session.error.message }, 502);
  }
  return json({ ok: true, url: session.url, deposit_chf: dep.chf });
};
