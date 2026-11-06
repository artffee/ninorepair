# November 6 repair

- AI repair estimates waive the $65 diagnostic fee whenever work is performed on the same visit, including one small job.
- Chat cannot collect a booking or promise an owner callback; it directs customers to the real contact flow.
- Both owner-email paths require SMTP recipient acceptance. Provider acceptance is not proof of inbox delivery.
- SMTP_FROM may specify a verified sender separately from SMTP_USER (needed for providers whose login is not an email address).

## Remaining external work

Production has GEMINI_API_KEY and NINO_PILOT_KEY but no SMTP credentials. Resend currently verifies ivosart.com; ninorepair.com is not a configured sender. Choose a verified NinoRepair sender or explicitly choose the art-domain sender before activating delivery. Keep the current SMS fallback enabled until configured and checked.

Mobile browser verification remains unavailable in the connected browser: it cannot set 320/375/430px widths. Required follow-up: homepage, TV page and Fort Lauderdale page at each width; menus, horizontal overflow, target sizes, sticky/chat overlap and non-submitting contact/estimator interaction. No mobile pass is claimed.

Validation: npm test; node --check server/app.js; git diff --check. No real customer messages or quote requests sent.
