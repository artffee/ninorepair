# ScanWonder pilot: NinoRepair discovery and quote requests

Audit date: November 6, 2026 (America/New_York). Owner: Ivaylo Peytchev.
Website: https://ninorepair.com
Baseline source: main `2ec81387e55d6b1730ae200e086e9dd131c69bfa`.

## What we are testing

Can clearer service answers and a dependable quote-request path help visitors
understand the offer and contact Nino? The existing TV-page test compares only
“Contact us” and “Request a repair quote.” Its assignment, SMS draft and receipt
reference remain unchanged. Changes below apply equally to both variants.

This is a working pilot, not a completed success case study. No traffic increase,
new customer, revenue gain, AI recommendation or winning variant is claimed.

## Verified baseline

| Check | November 6 finding | Meaning |
| --- | --- | --- |
| Production | Vercel `dpl_CPwFiPVkJhxeN9UnopwvTRsTuWuJ`, READY, main commit above | Recent pricing/contact fixes already published before this work |
| Service discovery | Six service pages and nine city pages linked from homepage | Preserve existing routes and prices |
| Sitemap | 17 public URLs | A sitemap is not proof of search indexing |
| Robots | General search allowed; `/api/` excluded; Cloudflare adds separate training-crawler restrictions | Do not remove training restrictions to pursue search visibility |
| AI health | `/api/health`: `ok:true`, `ai:true` | Configuration/health only, not a new end-to-end AI test |
| Online contact delivery | `contactDelivery:false` | Received SMS/calls are the practical contact route |
| Web Analytics | Vercel returns `web_analytics_not_enabled` for views and events | Historical visitors, AI referrals and site-wide conversion rates are unavailable, not zero |
| Existing quote pilot | `/api/quote-pilot`: `active:true` | Server relay can reach the existing measurement service |
| Pilot records | One enrollment, arm A; zero owner-confirmed receipts as of about 9:30 a.m. EST | May include QA; not evidence of a human visitor or performance lift |
| Search spot checks | Exact brand, site-limited and local TV-mounting queries did not return ninorepair.com in the retrieved sample | Limited search observation; not a Search Console or cross-assistant visibility audit |

Only aggregate pilot information is published here. Customer details and opaque
receipt references are not included. The private report lives at:
https://scanwonder.captainnemo007.chatgpt.site/admin#quote-pilot

## Implemented improvements

- Homepage answers describe services, cities, starting scopes/prices, minimums,
  materials and the exact quote/booking process. They are present in HTML and
  matching FAQ structured data. Business identity uses the same `#business` ID
  as the service pages. No new AI-specific markup or ranking promises.
- All 17 contact forms ask “How did you find me?” optionally: Google Search,
  Google Maps, ChatGPT, Gemini, Perplexity, another AI assistant, social media,
  referral/repeat customer, or other. Blank remains unknown.
- The chosen source is included in customer-reviewed SMS drafts and validated
  for the existing server contact path. No cookies, third-party tracker or
  automatic inference of the visitor's identity was added.
- Contact starts in draft mode and only switches to online submission after
  health explicitly confirms delivery. Offline, failed or missing health
  responses no longer leave an unusable sending path as the only form action.
- Contact copy explains that the customer must send the prepared text and a
  request is not a confirmed appointment. Without JavaScript, direct call/text
  links remain available and inactive forms are hidden.
- Existing no-email protections, AI prompts, rates and quote-test assignment
  remain in place. Stock photography is not presented as completed client work.

## Measurement protocol

1. Keep the existing test's cutoff: November 29, 2026 at 00:00 EST.
2. When a real message arrives with `NR-...`, mark that reference as received in
   the private ScanWonder owner view. A button click or prepared draft is never
   a received request. Do not mark synthetic QA or spam as a customer inquiry.
3. Count each real received request once. Record the customer's optional source
   as self-reported; if blank, leave it unknown. Do not publish personal contact
   information, private messages, photos or addresses as case-study evidence.
4. For the TV test report enrollments, owner-confirmed receipts and the receipt
   rate for each arm. Use the existing denominator only; it is not all website
   visitors. One enrollment and zero receipts are insufficient to select a winner.
5. Treat source counts as observational. Self-reported “ChatGPT” does not prove
   the specific answer or page that influenced a customer. General site traffic
   and automated referrer attribution remain unmeasured until analytics is enabled.
6. Annotate this deployment in the timeline. Since there is no reliable prior
   site-wide baseline, do not report a before/after percentage lift. Report
   measured counts with dates, limitations and concurrent changes instead.

## Repeatable ScanWonder audit offer

Deliver: service/location facts check; crawl, canonical and sitemap review;
pricing consistency; mobile/contact-flow checks; source-attribution plan; a
prioritized repair list; and a verified release record. Preserve evidence and
separate deployed fixes from outcomes. Real job photos and customer-approved
reviews can be added when supplied; no invented proof or guarantees of inclusion
in AI answers.

Reference guidance:
- https://developers.google.com/search/docs/appearance/ai-features
- https://developers.google.com/search/docs/fundamentals/ai-optimization-guide

## Validation

- 45 automated tests pass, covering pricing, homepage FAQ consistency, optional
  attribution validation, offline draft preparation, no-email behavior and
  preservation of both quote-button variants.
- All 18 HTML files checked: 17 contact forms have exactly one source selector;
  internal local links and fragments resolve; 17 sitemap URLs match canonicals.
- JavaScript syntax and whitespace checks pass.
- Local browser preview did not start because the preview runner supplied a
  port argument while this existing server reads `PORT`. Automated checks do
  not establish a mobile visual pass. Production browser results and deployment
  identifiers are recorded below after release.

## Release

Published November 6, 2026, about 9:38 a.m. EST.

- Merged PR: https://github.com/artffee/ninorepair/pull/4
- Production source commit: `d5810ee324a444a90c15bad7a2c4f08d7cc2e3ba`
- Vercel deployment: `dpl_HmNWzWxY6WfmcFgQKJByBrG8JhCf`, READY, assigned to
  `ninorepair.com` and `www.ninorepair.com`.
- Live browser confirmed the new title, FAQ section and starting prices; the
  optional source list includes Google Search, Maps, ChatGPT, Gemini and
  Perplexity. A synthetic browser-only draft included `Found via: ChatGPT` and
  displayed `Not sent yet`. No SMS, email, call, booking or AI request was sent.
- At the available 1000px viewport, no overflow, clipped FAQs or control overlap
  was observed. The browser could not resize, so mobile visual QA remains
  unverified. The TV test page was not visited during browser QA to avoid
  contaminating the enrollment count.
- Live health still reports `contactDelivery:false`; email activation is not
  part of this release. General Web Analytics remains disabled.
- A one-time results review and case-study draft is scheduled for the morning
  of November 30, 2026, America/New_York, after the existing test closes. Sparse
  results must be reported as inconclusive, not converted into marketing claims.

The release notes are a documentation-only follow-up to the deployed source.

