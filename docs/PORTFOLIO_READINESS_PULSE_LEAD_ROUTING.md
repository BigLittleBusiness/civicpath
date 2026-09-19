# Council Portfolio Readiness Pulse: Lead Routing and CRM Webhook Contract

## Purpose and operating boundary

The **Council Portfolio Readiness Pulse** is a public CivicPath assessment. It is designed to create a useful readiness snapshot for a prospect without requiring council project data. Public assessment records are maintained in a dedicated lead domain and are not created as council tenants, users, projects or Council Proof records. This separation is intentional: a visitor remains a prospect until a separate, authorised onboarding process creates a council workspace.

On completion, CivicPath commits the lead, assessment session, calculated snapshot, consent evidence and three delivery records in one database transaction. Only after that transaction succeeds does the application attempt the requested visitor email, the internal lead alert and the CRM webhook. A failed external route does not remove the assessment result or prevent the visitor from seeing it on screen.

## Persisted public lead records

| Record | Purpose | Key controls |
|---|---|---|
| `PublicLead` | Contact, council context, role, intended decision use case and lifecycle state. | Separate from `Organization`, never treated as a council tenant. |
| `PulseLeadSession` | Versioned assessment response set and non-reversible technical abuse-prevention fingerprints. | Stores no raw IP address or user-agent string. |
| `PulseLeadResult` | Deterministic scores, band, summary and three practical next actions. | Scoring version recorded for future traceability. |
| `PulseLeadConsent` | Resource-request and optional marketing-consent evidence, including wording and policy version. | Marketing consent is always separate and default-off. |
| `PulseLeadNotification` | Email, internal-alert and CRM delivery state, attempt count, result and error context. | Prevents duplicate delivery records per session and event type. |

## System Administrator configuration

Open **System Admin → Lead routing**. Saving routing settings requires the existing fresh password and authenticator-app step-up. Sensitive values are encrypted at rest with the platform encryption key and are never returned to the browser after saving.

### Transactional email settings

| Field | Requirement | Purpose |
|---|---|---|
| Enable transactional delivery | Explicitly enabled only after testing. | Enables the visitor snapshot email and internal lead alert. |
| AWS region | Required. Use the region containing the verified SES identity. | Selects the Amazon SES endpoint. |
| From name and From email | Required when email is enabled. | Sends the visitor’s requested snapshot. |
| Reply-to email | Optional but recommended. | Makes it easy for a prospect to respond. |
| Internal lead-alert email | Required when email is enabled. | Sends one concise alert to the nominated CivicPath owner. |
| AWS access key ID and secret key | Required when email is enabled. | Authenticates against the approved SES sending identity. |

### CRM webhook settings

| Field | Requirement | Purpose |
|---|---|---|
| Enable automatic CRM lead routing | Explicitly enabled only after endpoint testing. | Sends the `public_lead.captured` event. |
| Webhook URL | HTTPS required in production. | The CRM, integration platform or lead-routing receiver endpoint. |
| Webhook signing secret | Minimum 16 characters; use a unique high-entropy value. | Signs each outbound event with HMAC SHA-256. |

When neither route is configured, the assessment still records the lead, result and consent evidence. Its associated delivery rows are marked `disabled` rather than silently discarded.

## Webhook request

CivicPath sends an HTTP `POST` request after the lead transaction has completed.

| Header | Value |
|---|---|
| `Content-Type` | `application/json` |
| `User-Agent` | `CivicPath-Pulse/1.0` |
| `X-CivicPath-Event` | `public_lead.captured` |
| `X-CivicPath-Delivery` | CivicPath notification UUID; use as the idempotency key. |
| `X-CivicPath-Signature` | `sha256=<hex HMAC SHA-256 signature>` |

The signature is calculated over the exact JSON request body using the configured webhook signing secret. The receiver must verify the HMAC in constant time before creating or updating a CRM contact. It should treat `X-CivicPath-Delivery` as idempotent for at least seven days.

### Payload schema: `civicpath.public_lead.v1`

```json
{
  "schema_version": "civicpath.public_lead.v1",
  "event": "public_lead.captured",
  "event_id": "7d8310d4-0834-4211-8e7d-f9c0f0f1dfd9",
  "occurred_at": "2026-09-19T12:00:00.000Z",
  "source": "portfolio_readiness_pulse",
  "lead": {
    "civicpath_lead_id": "5fc8b926-7c7a-4f3e-85c5-7c16f7dc87d8",
    "first_name": "Avery",
    "last_name": "Ngata",
    "email": "avery.ngata@example.govt.nz",
    "council_name": "Example Regional Council",
    "country": "NZ",
    "state_or_region": "Waikato",
    "role": "economic_development",
    "role_other": null,
    "lifecycle_status": "new",
    "decision_use_case": "executive_briefing",
    "decision_use_case_other": null
  },
  "pulse": {
    "session_id": "daa47c1b-e544-4a9d-a48d-6dc7549ee209",
    "assessment_version": "1.0.0",
    "score_version": "1.0.0",
    "completed_at": "2026-09-19T12:00:00.000Z",
    "focus_themes": ["economic_growth", "workforce_skills"],
    "constraint_themes": ["evidence_data", "funding_pathway"],
    "scores": {
      "portfolio_visibility": 58,
      "strategic_connection": 75,
      "decision_readiness": 42,
      "overall": 58,
      "band_code": "connections_to_build",
      "band_label": "Connect the working view"
    },
    "recommended_actions": [
      {
        "title": "Clarify the next move",
        "text": "For each priority initiative, record one accountable owner, one clear next action and the material constraint that could stop progress."
      }
    ]
  },
  "consent": {
    "resource_request": true,
    "marketing_updates": false,
    "policy_version": "pulse-privacy-1.0"
  }
}
```

All fields shown in the schema are present unless explicitly noted as nullable. `marketing_updates` must not be inferred from the resource request: it is true only when the visitor independently selected the optional marketing checkbox.

## Receiver verification example

```js
import crypto from 'node:crypto';

export function verifyCivicPathSignature(rawBody, receivedSignature, secret) {
  const expected = `sha256=${crypto.createHmac('sha256', secret).update(rawBody).digest('hex')}`;
  const received = Buffer.from(receivedSignature || '', 'utf8');
  const expectedBuffer = Buffer.from(expected, 'utf8');
  return received.length === expectedBuffer.length && crypto.timingSafeEqual(received, expectedBuffer);
}
```

The webhook receiver should return a 2xx response only after it has durably accepted the event. Any non-2xx response or timeout is recorded by CivicPath as a delivery failure. CivicPath retries pending failures on a bounded 15-minute schedule for a maximum of three attempts. Operations should resolve recurrent failures through the delivery record and CRM receiver logs rather than creating duplicate contact records manually.

## Lead routing rules

| Condition | CivicPath action |
|---|---|
| Visitor completes the assessment | Persist lead, response session, calculation, consent and delivery records atomically. |
| Transactional email configured and enabled | Send the requested snapshot to the visitor and one internal alert to the nominated CivicPath owner. |
| Transactional email unconfigured | Retain the lead and result; mark email records as disabled. |
| CRM webhook configured and enabled | Post a signed `public_lead.captured` event after persistence. |
| CRM returns a non-2xx response or times out | Record the response/error and retry up to three times. |
| Visitor did not choose marketing consent | Deliver the requested snapshot only; do not add the contact to marketing communication. |
| Same email and council submits another Pulse | Refresh the public lead context, retain a new assessment session and update `lastPulseAt`. |

## Public launch checklist

Before the URL is shared publicly, verify the SES identity in the intended AWS region, run a controlled email test, configure and test the CRM receiver’s signature validation, confirm `CORS_ORIGINS` includes the marketing and application domains, complete the full CivicPath privacy policy and consent review, and verify the final production encryption key is distinct from development. The public assessment should be served only over HTTPS.
