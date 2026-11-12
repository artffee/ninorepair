# NinoRepair visitor tracking

Vercel Web Analytics was enabled on the existing Hobby plan on November 12,
2026. No paid upgrade was selected. Tracking begins with the deployment of
this change; earlier visitor counts cannot be reconstructed from this setup.

## What is measured

All 18 public HTML pages load `public/js/analytics.js`, including the 404 page.
The loader adds Vercel's first-party, cookie-free page-view script on
`ninorepair.com` and `www.ninorepair.com` only. Vercel reports aggregate
visitors, page views, popular pages, referring sites, countries, and devices.
The dashboard is private to the Vercel account:

https://vercel.com/usivaylo-5363s-projects/ninorepair/analytics

The loader honors Global Privacy Control and Do Not Track. Preview and local
hosts do not send analytics. Its `beforeSend` hook strips query strings and
fragments from page URLs; no form fields, chat messages, photos, or custom
conversion events are added by this integration.

## Interpretation and limits

- Visitor counts are approximate and can omit blocked scripts and opt-outs.
- A page view is not a customer inquiry or a confirmed booking.
- The existing TV quote experiment remains a separate measurement with its
  original assignment and owner-confirmed receipt rules.
- The optional "How did you find me?" response remains self-reported.
- The activation screen lists 50,000 events/month, 30 days of viewable history,
  capped ingestion, and no custom events for the current Hobby plan.
- Deployment verification visits may appear in the initial counts. Do not
  describe those visits as new customers or organic traffic.

## Verification

`npm test` covers all-page inclusion, both production hostnames, query/fragment
redaction, local/preview exclusion, and privacy opt-outs, alongside the existing
pricing, contact-delivery, and quote-pilot regression suite. Production checks
must also verify the loader and `/_vercel/insights/script.js` are served, and
confirm that the dashboard receives a clearly identified QA visit.

Official integration reference:
https://github.com/vercel/examples/blob/main/solutions/html/index.html

Official redaction reference:
https://vercel.com/docs/analytics/redacting-sensitive-data
