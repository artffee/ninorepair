# NinoRepair

Handyman and short-term-rental property care for the Greater Fort Lauderdale
area. A single-page marketing site with two AI features: a photo estimator that
returns a real ballpark range, and a front-desk assistant that answers pricing
and scope questions.

**Stack:** Node 20+, Express, Google Gemini (free tier). No build step, no
framework, no client dependencies — the front end is three files.

```
public/
  index.html      markup, schema.org business data, Google Fonts
  css/styles.css  the whole design system (51 KB)
  js/main.js      header, nav, reveals, photo estimator, contact form
  js/agent.js     chat widget — SSE streaming, markdown-lite renderer
server/
  index.js        Express app, three API routes, rate limiting, lead capture
  knowledge.js    single source of truth: scope of work, price book, prompts
```

## Running it

```bash
npm install
cp .env.example .env     # add GEMINI_API_KEY
npm start                # http://localhost:3000
```

A free key comes from [aistudio.google.com/apikey](https://aistudio.google.com/apikey).
Without one the site still serves — `/api/chat` and `/api/estimate` return 503
and the UI falls back to "call or text Nino" rather than breaking.

`npm run dev` restarts on file changes.

## Pricing checks

Run `npm test` (or `npm run check:pricing`) before committing pricing edits.
The deterministic Node test suite needs no API key, network or extra packages.
It audits every service page, city service grid and 404 recovery grid, checks visible FAQs against
JSON-LD, and compares job-specific starting prices with `PRICE_BOOK` in
`server/knowledge.js`. Mutation cases verify that the original TV/assembly
mix-up, conflicting metadata, omitted visit minimums and lost diagnostic-fee waivers fail the check. Host retainer rates are also checked against the price book.

Keep prices attached to the work they describe:

| Service page | Advertised starting scope |
|---|---|
| Drywall & painting | Small drywall patches under 6 inches: $130 |
| TV mounting & assembly | 32–55 inch TV into studs: $145; standard furniture assembly: $65, separately labeled |
| Doors & locks | Lockset/deadbolt swap: $85; smart lock installation/setup: $130 |
| Pool cage rescreening | $45 per panel, with a $185 minimum visit |
| Pressure washing & hurricane prep | Two-car driveway: $180; single-story gutter cleaning: $175 |
| Tile, grout & grab bars | Grab bars: $95 each; standard shower regrouting: $420 |

These scopes were audited against the detailed service FAQs and the price book
from main commit `133940fc2d83d401ff962de93daac24a506ce7ef`. The price book
confirms the TV FAQ and distinguishes gutter cleaning from pressure washing,
and backsplash caulking from grab bars. No price-book rates were changed.
When rates change, update that source, the page copy/metadata/JSON-LD and all
city and 404 grids together. Extend the test's scope assertions for new services.

The follow-up review adds minimum-charge, waived diagnostic-fee, materials and
access-surcharge explanations to all six service FAQs and their JSON-LD copies.
The chat/dock spacing rule now lives in the shared stylesheet so it also applies
to the homepage. See [the verification record](docs/pricing-verification.md) for
current automated, responsive, inquiry-flow and production-access results.

## API

| Route | What it does |
|---|---|
| `POST /api/chat` | Streams the assistant back as SSE (`event: delta` / `done` / `error`) |
| `POST /api/estimate` | Multipart, up to 5 photos ≤8 MB. Returns a schema-validated estimate |
| `POST /api/lead` | Contact form. Appends to `data/leads.jsonl`, emails if SMTP is configured |
| `GET /api/health` | Key present, provider, models |

Both AI routes are rate limited per IP in memory (swap for Redis behind more
than one instance).

## How the estimator works

Photos go to Gemini as inline base64 with the price book as the system
instruction. The response is constrained by a JSON schema generated at boot from
the same zod object that then validates the reply — one source of truth, so the
schema the model sees and the shape the renderer trusts cannot drift.

Every estimate is a range, never a single number, and the model is instructed to
refuse to price anything that needs a licensed trade or an inspection first. The
result card renders those two cases as a notice instead of a price.

## Florida scope of work

The site states plainly what a handyman may legally perform in Florida, what
needs a state-licensed trade, and what nobody should touch. That distinction
lives in `server/knowledge.js` and is enforced in both system prompts: the
assistant never quotes licensed-trade work. Treat that file as the contract —
copy on the page and answers from the AI both come from it.

## Notes before this goes live

- **Free-tier data use.** On the Gemini API free tier, Google may use submitted
  content to improve their products — that includes customer photos. The paid
  tier does not. Worth revisiting before real customers use the estimator.
- **Prompt caching.** The system prompt must stay byte-identical between
  requests or Gemini's implicit caching stops hitting. The console logs
  `cached=` per request; if it sits at 0, something started interpolating.
- **Untested against the live API.** The Gemini wiring has been verified for
  boot, schema shape and the no-key path, but no live call has been made yet.
- Prices in `knowledge.js` are Broward County market rates and want a seasonal
  review.

## Image credits

The homepage uses candid process photography for atmosphere, not as a claim of
completed NinoRepair jobs:

- Drywall fitting: [Antoni Shkraba / Pexels](https://www.pexels.com/photo/a-man-fixing-the-wall-4981812/)
- Wall mounting: [Anete Lusina / Pexels](https://www.pexels.com/photo/faceless-man-putting-decoration-on-wall-while-using-hammer-4792530/)
- Measuring: [Ksenia Chernaya / Pexels](https://www.pexels.com/photo/crop-man-measuring-wooden-board-in-room-5691673/)
- Punch-list monster: adapted from the project owner’s existing A305X shop avatar.

## ScanWonder quote-request pilot

The TV mounting page tests “Contact us” against “Request a repair quote” on an SMS button. Each version opens the same editable draft. Only the owner can confirm a received request using its random NR reference. The relay forwards only that reference and is configured by the server-only `NINO_PILOT_KEY`. Missing measurement, privacy signals and the November 29, 2026 cutoff leave the ordinary text link available. The report and the receipt-entry controls are in the [private ScanWonder owner view](https://scanwonder.captainnemo007.chatgpt.site/admin#quote-pilot).
