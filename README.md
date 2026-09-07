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
