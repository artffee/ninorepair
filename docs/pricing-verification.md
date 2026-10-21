# Pricing correction verification

Reviewed PR #1 against main `133940fc2d83d401ff962de93daac24a506ce7ef`
and the unchanged `PRICE_BOOK` in `server/knowledge.js`.

## Findings and corrections

The original PR correctly separated TV mounting ($145) from standard furniture
assembly ($65), driveway washing ($180) from gutter cleaning ($175), and grab
bars ($95 each) from shower regrouting ($420). It named the $130 small drywall
patch and $85 lockset/deadbolt scopes and showed the pool-screening $185 visit
minimum beside the $45 panel rate.

The follow-up found the old generic prices still present in `public/404.html`.
Its recovery links now use the same scoped prices as all nine city pages.
All six service pages also explain the $95 hourly rate and one-hour minimum,
$65 diagnostic fee waived when work proceeds on the same visit, materials at
cost plus 15% unless customer-supplied, and the applicable $45 access surcharge.
Those explanations appear identically in visible FAQs and FAQ JSON-LD.
The hourly minimum is described as applying to hourly work; fixed-scope
assembly is still advertised at the price-book starting rate of $65 per item.

The mobile chat-spacing fix was moved from the inner-page stylesheet to the
shared stylesheet after the browser check found it still covered the homepage
quick-action dock. No service routes, inquiry handlers, estimator logic, AI
prompts or price-book rates were changed.

## Automated verification

- `npm test`: 34 passing deterministic tests.
- Every service's price badges, meta description, Open Graph description,
  structured Service description and pricing FAQs agree with the price book.
- Visible FAQs match their FAQPage JSON-LD copies.
- All nine city grids and the 404 recovery grid are covered, with an additional
  scan for service-price grids on future HTML pages.
- Host retainers ($299/$499/custom) and city diagnostic-fee explanations are
  checked against the price book.
- Negative cases reject TV/assembly confusion, incorrect FAQ prices, omitted
  pool minimums, missing trip-fee waivers and other original regressions.
- `git diff --check`: passes.

## Browser verification

Chromium checked all 18 HTML pages (homepage, host page, 404, six service pages,
nine city pages) at 320, 375, 430 and 1280 CSS pixels: 72 route/viewport checks.
No horizontal overflow, clipped price badges, chat/dock overlap or JavaScript
page errors remained. Mobile menus, FAQ expansion and chat opening/closing
worked. TV mounting, pool-screening, Fort Lauderdale and 404 layouts were
visually reviewed at mobile size.

Local inquiry tests exercised the homepage, TV service and Fort Lauderdale city
forms: missing-field validation worked, each POST returned 200, the success UI
appeared, and three test leads were written to local JSONL storage. SMTP was
disabled; no customer inquiries or messages were sent to the business.

The photo picker rendered an uploaded test image and submitted the expected
multipart fields. With no Gemini key in the local environment, estimator and
chat requests returned the documented 503 and displayed call/text fallbacks.
Live AI generation and production email delivery were not exercised. The
existing application and API JavaScript are unchanged by this correction.

## Production and access boundary

Before merge, `https://ninorepair.com/` returned an older homepage that differs
from repository main and still advertises generic rates. The TV service URL
`https://ninorepair.com/services/tv-mounting/` returned HTTP 404; the corresponding
`ninorepair.vercel.app` route also returned 404. A repository merge alone must
not be represented as a verified production release.

Vercel identifies project `ninorepair` (`prj_Xu0uwkBdHHgDUrR8zpmqSLGQ82x8`) in
team `usivaylo-5363s-projects` (`team_h9a6UAtdfEyOIHcS9zYtSfOm`), with verified
`ninorepair.com`, `www.ninorepair.com` and `ninorepair.vercel.app` domains. The
accessible deployment metadata reports a prior CLI production deployment;
there is no confirmed Git-triggered deployment for this PR.

An explicit read under that team returns 403: the connection needs access to
that scope. The CLI fallback has no saved credentials. To complete publication,
grant the Vercel connection access to this existing team/project, deploy the
merged main commit to this project's production environment, then verify all
service/city URLs, metadata, custom 404, mobile layouts and API health on the
actual deployment. Preserve the project's existing environment variables and
confirm inquiry delivery and AI availability without sending test customer
messages unless specifically authorized.
