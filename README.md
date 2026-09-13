# phone.atomicai.ch — Atomic Phone

Standalone launch + reservation page for Atomic Phone (One · One S · One XS). Apple-style structural
rhythm: small eyebrow → giant claim → full-bleed product, generous whitespace, "up to X" stat cards with
a Compare-with dropdown, macro breaks between feature sections, a persistent price pill, thin rules.
Hosted on **Netlify**.

```
phone/
├── index.html                    the page — one file, no framework
├── netlify.toml                  publish = "." · functions in netlify/functions
├── netlify/functions/reserve.mjs Netlify Function (Functions 2.0) → Stripe Checkout, served at /api/reserve
├── _headers                      cache + security headers (Netlify reads this file natively)
├── models/  (13 × ~1 MB)         Draco + 2K WebP GLBs      models/m/ (13 × ~0.8 MB)  1K set served to phones
├── posters/ (13 + thumbs)        hero-angle stills rendered from our GLBs (poster/fallback only)
├── env/atomic-studio.hdr         procedural neutral studio HDRI (dark backdrop, key softbox, top strip, rim)
├── lib/                          vendored model-viewer 4.2.0 + Draco decoder
└── tools/                        asset pipeline: optimize.mjs · recolor.mjs · makehdr.mjs · posters.mjs
```

## Colour system (strict)

- Background: `#000000` on every layer. Panels (stat cards, option cards, callouts, notices, banner,
  summary, terminal, skeleton) are `#000` with a hairline outline — no grey or tinted fills anywhere.
- Text: white in opacity steps (`--ink` 100% · `--ink-2` 72% · `--ink-3` 48% · `--ink-4` 26%);
  hairlines `--rule` 14% / `--rule-soft` 8% white.
- Accent: `#03FCEC` — `--tq`, with `--tq-2/3/4` = the same colour at .7/.32/.12 alpha. Used for buttons,
  links, focus rings, active states, winning stats, check-marks, the price pill CTA, the favicon.
- The same `#03FCEC` is applied **inside the Black/Turquoise model textures** (kill switch, mute switch,
  camera rings, wordmark, OLED-strip emissive) by `tools/recolor.mjs` on the optimised GLBs. The
  Substance masters in `Colorway-2/` are untouched; re-run the recolour after `npm run optimize`.
- Exception: colorway **swatches** render the product's real colours (`COLORWAYS[].base/.accent`),
  because they *are* the product colour — same reason the 3D model renders in its true colorway.

## 3D — which viewers are interactive

| Viewer | camera-controls | auto-rotate | Reset / hint |
|---|---|---|---|
| Hero | **on** — free orbit, full sphere, scroll/pinch zoom | on | yes / one-time hint |
| Colorway picker | **on** | on | yes |
| Eight feature macros (chip … bottom edge) | off — pinned to the section's framing | off | hidden |
| Reserve summary | off — showcase only | on | hidden |

Colorway swaps keep the user's orbit/zoom/target/FOV exactly on the interactive viewers; the previous
model stays on screen until the next one is decoded. All colorways of the active model are prefetched.
Lighting: `env/atomic-studio.hdr`, `exposure 1.35`, ACES, soft ground shadow. Keep the HDR URL query-free
(model-viewer picks its loader by extension); GLBs/posters use `?v=ASSET_V`.

Colorways: One — Black/Turquoise, White/Pink, White/Black, Black/White, Black/Red, Limited (`gold-green`
key → `one-green-gold.glb`: dark-green body, gold traces — the newest designer export; the earlier
gold-body export is kept as `one-gold-green.glb`, not exposed). One S / One XS — Black/Turquoise,
White/Black, White/Pink. `../Colorway-2/MAPPING.md` maps clean names to the original filenames.

## Reservation / Stripe

`POST /api/reserve {model, colorway, storage}` (routed to `netlify/functions/reserve.mjs` via
`export const config = { path: '/api/reserve' }`) → Checkout Session whose only line item is the model's
flat refundable deposit:

| Model | Deposit | Price ID |
|---|---|---|
| One | CHF 50 | `price_1U78rwEhCuxRDC5VSedpTjPz` |
| One S | CHF 35 | `price_1U78unEhCuxRDC5Vu8cElw4k` |
| One XS | CHF 25 | `price_1UEAhlEhCuxRDC5ViWumXN7a` |

Configuration, expected retail price, "refundable" and "release date TBD" go into session metadata and
the payment description; the disclosure is also rendered on the Stripe page (`custom_text.submit.message`).
Success → `/?reserved=success#reserve`, cancel → `/?reserved=cancel#reserve`. The 45 per-SKU full-price
IDs are embedded in `index.html` (`SKU_PRICE_IDS`) for reference only.

### Testing checkout locally — why a plain static server returns HTTP 501

`netlify/functions/reserve.mjs` is a **Netlify Function**. A plain static file server cannot execute it:
`python3 -m http.server`, `npx serve`, VS Code Live Server and similar will always answer
`501 Unsupported method ('POST')` (or 404/405) for `POST /api/reserve`. **That is correct, expected
behaviour — not a bug, and nothing to patch around.** The page shows its friendly "checkout couldn't be
opened" message in that case.

To exercise the real flow:

1. Locally with the Netlify runtime — from this folder:
   ```
   npm i -g netlify-cli            # once
   echo 'STRIPE_KEY=sk_test_…' > .env   # never commit this file (or: netlify env:set STRIPE_KEY sk_test_…)
   netlify dev
   ```
   `netlify dev` serves the static files *and* runs `netlify/functions/`, injecting `.env` (and any linked
   site's variables) as the environment. Open the URL it prints and click Reserve.
2. Deployed to Netlify with `STRIPE_KEY` set under Site configuration → Environment variables (mark it
   secret). Use `sk_test_…` first, then `sk_live_…`. `APP_ORIGIN` is optional — the function falls back to
   Netlify's `URL`, then the request origin.

Disclosure appears: under the hero, in the reserve steps, in the summary card, on the Stripe page, in
the success banner, and twice in the footer — every one naming `pavlo@atomicai.ch` for refunds.

## Deploy (Netlify)

Site root = this folder, no build command, publish directory `.` (already in `netlify.toml`).
Set `STRIPE_KEY` (secret) in the site's environment variables; custom domain `phone.atomicai.ch`.
CLI: `netlify deploy --prod --dir .` from this folder, or connect the folder in the Netlify UI.

## Regenerating assets

`cd tools && npm install`, then `npm run optimize` (Colorway-2 → models/ + models/m/), recolour the
three Black/Turquoise files (`node recolor.mjs ../models/one-black-turquoise.glb '#03fcec' 88`, and the
`models/m/` copies with quality 85), `npm run hdr`, and with the folder served on :8765, `npm run posters`
(hero angle `-152deg 80deg`).
