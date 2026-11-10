# Property-care and contact review — November 10, 2026

Reviewed ninorepair.com/#airbnb against main ecb213d.

## Corrections

- Restored readable heading and description colors on the navy contact section.
- Kept a full 44px mobile menu control inside the header. At the 390px iframe viewport the old control shrank to 17px and extended outside the header; it now remains 44px wide and fits inside it.
- The homepage property-care inquiry now selects Airbnb / property care while preserving entered details. Added direct inquiry actions to the full host-program page.
- Photo-estimate buttons labeled as texting now use SMS links. The chat greeting now accurately describes its telephone link.
- Prepared text drafts retain the optional email and estimate reference, city, original description and estimate summary. Editing form fields removes stale drafts until prepared again.
- Estimate follow-up confirmation describes delivery and pending scheduling accurately.

## Validation

- 49 Node tests pass, including draft context preservation, service selection and stale-draft invalidation. Existing pricing, delivery and quote-pilot tests pass.
- All 18 HTML pages' internal links/assets/fragments resolve. All 17 sitemap entries match their page canonicals.
- Desktop browser review and narrow iframe layouts at 390px and 320px. No horizontal document overflow; mobile navigation opens and closes. These are browser layout checks, not tests on physical phones or SMS apps.
- Browser-only synthetic contact draft preserved service, email and details; editing removed the old draft and regenerated the updated content. No inquiry, SMS, email or call was sent.
- A live synthetic business-hours chat question returned a streamed answer and successful completion. Photo uploads/model estimates were not exercised in this review.
- Live health reports contactDelivery:false. Email is still unconfigured; visitors review and send prepared texts in their own messaging app. General visitor analytics was not changed.

[Mobile layout evidence](verification/nino-mobile-contact-qa.png)
