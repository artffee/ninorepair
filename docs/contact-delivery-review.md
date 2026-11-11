# Automatic contact delivery — review, November 11, 2026

Status: proposed changes only. Merge, deployment, production credential changes and live message delivery require the owner's explicit approval. No email, SMS or customer inquiry was sent during this review.

## Current evidence

- Inspected main `5b64d287d38ec082e20b28a87864f1d741ae2bae`, including merged [PR #5](https://github.com/artffee/ninorepair/pull/5) and the [November 10 report](november-10-contact-repair.md).
- A read-only request to `https://ninorepair.com/api/health` returned `contactDelivery:false`.
- Vercel's environment-variable metadata lists the existing AI and quote-pilot keys, but no SMTP variables. Secret values were not requested or printed.
- The connected Resend account lists `ivosart.com` as verified with sending enabled. Neither `ninorepair.com` nor a NinoRepair subdomain is registered there. The other two listed domains are not verified. No domain, key, DNS record or provider setting was changed.

## Proposed behavior

Keep Nodemailer and the existing SMTP path. Resend supports it directly, so a second email integration is unnecessary.

- Delivery defaults to off. `CONTACT_DELIVERY_ENABLED=true`, all SMTP fields, an explicit sender, and one explicit owner recipient are required. Vercel Preview and Development environments cannot send, even if they inherit credentials.
- Require TLS with certificate verification and bounded SMTP timeouts. Disable filesystem/URL content reads and SMTP protocol logging.
- Return `202 {ok:true, delivery:"accepted"}` only after a final SMTP 250 response accepts the exact business recipient and reports no rejected recipients. This means provider acceptance, **not inbox arrival**. Both forms use that wording and reject legacy `{ok:true}` responses as insufficient evidence.
- Missing configuration returns 503. Failed, rejected, malformed or timed-out SMTP results never return success. An uncertain outcome explicitly warns that a delayed email may still arrive. No automatic retries.
- On failed or uncertain submission, preserve form details and prepare a reviewed SMS draft. The visitor still has to open their messaging app and tap Send. Editing invalidates an old draft. Existing direct call/text links remain available.
- Validate and bound contact fields, check optional email syntax, reject header control characters, nonempty honeypots, extra routing/attachment fields, foreign or absent browser origins, and non-JSON requests. The customer can set Reply-To, never From/To/CC/BCC.
- Remove raw lead/error logging, IP collection in the lead record and local JSONL storage. A disk write is no longer treated as delivered email. Application logs contain fixed outcome codes only. Private/no-store responses avoid caching inquiry responses.
- Automatic email of photo estimates stays separately disabled with `ESTIMATE_EMAIL_ENABLED=false`. Contact callback emails include the estimate context but do not attach photos. Enabling contact delivery alone will not start emailing every estimate upload.
- Services, prices, navigation and direct contact links are unchanged. HTML edits only update cache versions for the changed scripts.

`contactDelivery:true` in health means configuration permits an attempt. It does not verify credentials, sender authorization, provider availability, quota or receipt of an individual message.

## Exact proposed configuration (after approval)

The lowest-change option for owner-only notifications is the already verified IvosArt domain. These values are a proposal, not active configuration:

| Production variable | Proposed value |
|---|---|
| `SMTP_HOST` | `smtp.resend.com` |
| `SMTP_PORT` | `587` (mandatory STARTTLS) |
| `SMTP_USER` | `resend` |
| `SMTP_PASS` | A new dedicated Resend sending-only API key, restricted to the approved verified domain; stored as a production secret |
| `SMTP_FROM` | `ninorepair@ivosart.com` — requires approval of using this sender identity |
| `LEAD_TO` | `usivaylo@gmail.com` — the existing business destination, to be confirmed at activation |
| `CONTACT_DELIVERY_ENABLED` | `false` while staging; `true` only after explicit live-delivery approval |
| `ESTIMATE_EMAIL_ENABLED` | `false` |

`SMTP_FROM` and `LEAD_TO` each take one bare email address, without a display name or comma-separated list. The code adds the NinoRepair Website display name. Do not put keys in GitHub, frontend code, PR text, screenshots or chat. The connected Resend account does not automatically give the website a runtime key. No key was created or recovered in this review. Existing verified-domain use still needs a controlled delivery test and a quota/account-status check; verification alone does not prove a working inbox path.

For a NinoRepair-branded sender instead, use a dedicated subdomain such as `requests.ninorepair.com` and `website@requests.ninorepair.com`. After approval:

1. Confirm the DNS host and available Resend domain capacity, then register that exact sending subdomain in Resend.
2. Retrieve the generated DNS instructions: DKIM TXT record and the SPF TXT / MX records for the provider's return-path host. Copy the exact names, values, region-specific targets, priorities and TTL instructions returned for that domain. Those values cannot be provided yet because this domain has not been created; do not invent a DKIM key or substitute another domain's records.
3. Add only those records. Preserve existing root-domain mailbox MX records and avoid duplicate SPF records at the same host. Review existing DMARC and configure alignment without weakening an existing policy. A new domain may start with monitoring before enforcement, after considering the other legitimate senders.
4. Wait for Resend to report the exact sending domain verified. Keep tracking off for these transactional inquiries. Create a domain-restricted sending key and store it privately as above.

This application sends request notifications to the business, not marketing mail or automatic customer replies. The provider and recipient mailbox will process and retain message contents under their settings; review their retention and access controls before activation. Failed requests are not queued in this application.

## Verification

- Baseline: all 49 existing Node tests passed.
- Proposed implementation: `npm test` passes **80 tests**, including existing pricing tests, HTTP request/response integration with a mocked SMTP transport, exact-recipient acceptance, rejection, timeout, configuration gates, injection/validation, no private data in logs, malformed/oversized JSON, and 14 DOM integration scenarios using the real homepage and scripts.
- DOM scenarios cover both forms, provider acceptance, unconfirmed delivery, disabled delivery, legacy success, network/timeout/JSON errors, context retention and stale-draft removal. JSDOM is a development-only dependency; these are not visual browser or physical-phone checks.
- `git diff --check` passes. Service content and pricing remain unchanged; HTML changes are script cache hashes only.
- A reproducible Playwright checker is included at `scripts/verify-contact-browser.mjs`. Browser execution was **blocked** here: the packaged browser was unavailable, system Chromium could not start because of the environment's socket restrictions, and the separate cloud browser could not reach the local server. No local browser-pass or new screenshot is claimed. The proposed GitHub Actions workflow runs this checker with an installed Chromium browser; its result must pass before deployment. For local use, run `npx playwright install chromium` or set `PLAYWRIGHT_CHROMIUM_EXECUTABLE_PATH`. It intercepts delivery/AI API results and blocks external traffic.
- Real SMTP authentication, sender acceptance, provider quotas, inbox placement, bounced mail and real-device SMS handoff remain unverified. No live customer delivery was enabled.

## Approval and rollout

1. Review this change and the draft PR. The review branch disables its own automatic Vercel deployments through `git.deploymentEnabled`; other branches are unchanged. There are no deployment commands in the proposed test workflow.
2. Obtain explicit approval before merging or deploying. Complete the browser check first. An initial deployment can keep email disabled and retain the current SMS workflow.
3. Separately approve the sender identity, recipient, credential/DNS work and a clearly labeled synthetic test message. The operator-only `node scripts/check-contact-smtp.mjs` verifies connection/TLS/authentication without sending; it does **not** prove sender authorization or inbox delivery and does not change the website's activation flag.
4. With the public form still disabled, verify one approved synthetic message reaches the owner's actual inbox and examine provider status plus SPF/DKIM/DMARC results. Do not use real customer details for this test.
5. Obtain explicit approval for production credentials and live customer delivery before setting the production activation flag and deploying that configuration. Confirm health, submit the specifically approved synthetic inquiry, verify owner inbox arrival, and check the SMS fallback with controlled failures outside production.
6. If delivery becomes unreliable, set `CONTACT_DELIVERY_ENABLED=false` and deploy the updated configuration (requires approval); verify health returns false and forms prepare texts. Changing an environment variable does not modify an already-created Vercel deployment. Revoke a dedicated key only with approval if needed; in-flight email may still complete.

Limitations: the inherited rate limiter is per process and is not a global abuse quota. Origin checks deter cross-site browser submissions, not a scripted bot. There is no durable outbox, delivery webhook or application-level deduplication across reloads/instances. SMTP timeouts are ambiguous, so the UI offers manual contact without retrying email. Provider-level abuse/quota controls and bounce monitoring need review before activation; heavier traffic may justify shared rate limits, an outbox and authenticated delivery-event handling.

## Primary provider references

- [Resend SMTP settings](https://resend.com/docs/send-with-smtp)
- [Resend verified sending domains](https://resend.com/docs/dashboard/domains/introduction)
- [Resend API-key scope and security](https://resend.com/docs/dashboard/api-keys/introduction)
- [Resend DMARC setup](https://resend.com/docs/dashboard/domains/dmarc)
- [Nodemailer SMTP TLS, timeouts and verify limitations](https://nodemailer.com/smtp)
- [Vercel branch deployment controls](https://vercel.com/docs/project-configuration/git-configuration)
