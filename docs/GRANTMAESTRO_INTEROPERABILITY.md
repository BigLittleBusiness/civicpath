# CivicPath and GrantMaestro interoperability boundary

## Product rule

CivicPath and GrantMaestro are separate products with separate customer journeys, repositories, databases, privacy scopes and subscriptions. Neither product reads or writes the other product’s MySQL tables.

## Initial interoperability approach

When a Council elects to connect both products, an authorised organisation administrator will establish an API-to-API connection. The first narrow integration may synchronise only:

| Direction | Approved record types | Purpose |
| --- | --- | --- |
| CivicPath → GrantMaestro | Project reference, title and authorised internal owner reference | Link an application to a known Council project. |
| GrantMaestro → CivicPath | Grant reference, funder, lifecycle status, requested/awarded amount, due date and acquittal status | Present a portfolio-level funding position without duplicating lifecycle work. |

## Security contract

The connection must use an organisation-scoped service credential, encrypted at rest, rotated on disconnect, and limited to the elected organisation. Every synchronisation must be idempotent, timestamped and recorded in the CivicPath audit log. Each product must continue to function when the connection is unavailable. No grant document, notes, password, personal data, payment data or unrestricted user record may move through the initial integration.

## Deferred integration work

Webhook delivery, automatic document synchronisation, single sign-on and cross-product task synchronisation are intentionally deferred until the standalone products have stable APIs, customer demand and privacy/security approvals.

