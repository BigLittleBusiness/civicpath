# CivicPath Contact Form Security and Routing

CivicPath accepts enquiries through protected forms rather than publishing contact addresses or `mailto:` links. This applies to the public marketing contact page, the Council Portfolio Readiness Pulse capture, and the authenticated support form in the CivicPath portal. Public enquiry records are kept separate from council tenant and project data; authenticated support requests create a tenant-scoped support case.

## Protection model

Each form uses **ALTCHA**, self-hosted by the CivicPath Node/Express API. The browser fetches a short-lived, purpose-bound challenge from the API, performs a privacy-friendly proof of work, and submits an encoded solution with the form. The API verifies the signed solution, enforces the purpose, atomically consumes the challenge so it cannot be replayed, and rejects expired or invalid submissions. ALTCHA requires HTTPS because it uses the browser Web Crypto API.

ALTCHA is supplemented by a hidden honeypot field and endpoint-level rate limits. The public contact endpoint permits at most twelve submissions per network per hour, while challenge issuance is separately limited. Form content is validated with explicit field limits before storage.

## Routing and data handling

Public sales, Council Proof and general enquiries are written to the `public_contact_enquiries` table. The stored record includes the message, source metadata, privacy acknowledgement, internal-notification and Council Proof confirmation-delivery states, and an accountable System Administrator follow-up state, owner, due date and note. It is deliberately not linked to a council tenant. The platform-only **Public enquiries** view filters these records by category and follow-up status, while each update is audited.

Portal support enquiries are written to the tenant-scoped `support_cases` table and audited. A user may include up to three screenshots or documents, each at most 10 MB. The API permits only PNG, JPEG, WebP, PDF, TXT, Word and Excel file types, checks applicable file signatures, and stores only private attachment keys in the database. Production accepts attachments only when the private `SUPPORT_ATTACHMENT_S3_BUCKET` is configured; uploaded objects use no public ACL or URL and are retrieved through an audited System Administrator download route. Local private storage is available only for development verification.

After a record is committed, CivicPath attempts a transactional email delivery through Amazon SES. The recipient address is held only server-side, is not sent to browsers, and routes every website or portal enquiry to the approved Big Little Business public correspondence mailbox. All notification subjects use the required convention:

| Form path | Delivered subject |
|---|---|
| CivicPath sales enquiry | `CivicPath - Sales enquiry` |
| Council Proof enquiry | `CivicPath - Council Proof enquiry` |
| Council Proof prospect confirmation | `CivicPath - Your Council Proof enquiry` |
| General enquiry | `CivicPath - General enquiry` |
| Portal support enquiry | `CivicPath - Support enquiry` |
| Portfolio Readiness Pulse recipient result | `CivicPath - Your Portfolio Readiness Snapshot` |
| Portfolio Readiness Pulse internal alert | `CivicPath - New Portfolio Readiness Pulse — {Council}` |

For a Council Proof enquiry, the prospect confirmation states that a paid **$495 Council Proof fee** is applied as a conversion credit against the Council's first annual CivicPath subscription when the Council proceeds within 30 days of the final Proof review. It also confirms that the enquiry itself creates neither an invoice nor a payment obligation. If SES has not been configured, the submission remains stored with delivery marked disabled. It is not discarded. Once SES is enabled, failed public-contact alerts and Council Proof confirmations retry at most three times using the scheduled retry worker.

## Production deployment

Set a distinct high-entropy `ALTCHA_HMAC_SECRET` in `api/.env`. It is required in production and must not be reused for JWTs, platform encryption, webhooks or any other signing purpose. Apply migrations `006_public_contact_and_altcha.mjs`, `007_enquiry_follow_up_and_support_attachments.mjs` and `008_council_proof_confirmation_delivery.mjs` after migrations 001–005. Configure least-privilege AWS credentials, `AWS_REGION` and a private `SUPPORT_ATTACHMENT_S3_BUCKET` before enabling production support uploads. Build the marketing website with `VITE_CIVICPATH_API_BASE_URL=https://app.civicpath.com.au/v1` and retain `https://www.civicpath.com.au` in `CORS_ORIGINS`.

Do not enable SES delivery until the approved SES identity, least-privilege sending credential, DKIM, suppression controls and an end-to-end delivery test are complete. Zoho Mail remains the inward-email service for replies.

## Scope boundary

The CAPTCHA requirement covers all public contact and lead-capture forms plus the authenticated support enquiry form. Authenticated CivicPath operational forms—such as project entry, account settings and System Administrator configuration—remain protected by signed session cookies, role checks and, for privileged actions, mandatory System Administrator MFA and step-up verification rather than a second CAPTCHA challenge.
