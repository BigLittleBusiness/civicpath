# CivicPath Production Platform and Communications Standard

## Authoritative production model

CivicPath is a standalone SaaS product. Its production application will be deployed on **Binary Lane**. AWS provides outbound application services: **Amazon SES** sends transactional email and **Amazon S3** stores application files. **Zoho Mail** receives and manages inbound email for the parent company, **Big Little Business**.

This is a deliberate division of responsibility. Binary Lane hosts the web application, API, database, Nginx reverse proxy and PM2 process. AWS SES is used only for programmatic outbound transactional email. AWS S3 is the durable object store for documents and generated files. Zoho is the mailbox provider for staff correspondence and replies; CivicPath does not use SES receiving rules for normal inbound email.

| Capability | Production service | Required boundary |
|---|---|---|
| CivicPath web application, API and MySQL | Binary Lane | Dedicated CivicPath deployment, database and production secrets; separate from GrantMaestro. |
| Public application domain | `app.civicpath.com.au` on Binary Lane | HTTPS-only application and API; Node and MySQL are not publicly exposed. |
| Public marketing domain | `www.civicpath.com.au` | Separate public marketing deployment or server block, with approved CORS access to the application API where required. |
| Outbound transactional email | Amazon SES | Requested Pulse snapshots, account/security notices and other application-triggered mail only. |
| File and document storage | Amazon S3 | Private bucket, encryption, least-privilege access, lifecycle controls and no public bucket access. |
| Inbound email and staff mailbox access | Zoho Mail | MX for `biglittlebusiness.com`; staff access and reply handling occur in Zoho. |

## Big Little Business mailbox roles

CivicPath’s first mailboxes are parent-company addresses. Their responsibilities must remain clear so that customer correspondence, system administration and technical supplier notices do not become mixed together.

| Mailbox | Primary role | CivicPath configuration or operating use |
|---|---|---|
| `hello@biglittlebusiness.com` | Public and customer-facing correspondence | Default SES From and Zoho Reply-To address for CivicPath transactional email. This is the mailbox visitors and councils use when replying. |
| `admin@biglittlebusiness.com` | Platform administration and business operations | Account, vendor, billing, privacy and administrative correspondence. Do not use as the anonymous public sender. |
| `tech@biglittlebusiness.com` | Technical operations | AWS, Binary Lane, DNS, security, delivery-failure and infrastructure notices. Use for service-provider account contacts where a technical mailbox is appropriate. |
| `kristian@biglittlebusiness.com` | Named business owner and lead owner | Default internal alert recipient for a completed Council Portfolio Readiness Pulse and escalation owner for high-priority customer matters. |

## Amazon SES and Zoho coexistence

Amazon SES can send mail with `From: hello@biglittlebusiness.com` while Zoho receives replies for that mailbox. The two services do not require competing MX records on the parent domain:

1. Keep the `biglittlebusiness.com` MX records directed to Zoho so that incoming replies and staff mail arrive in Zoho.
2. Create an SES domain identity for `biglittlebusiness.com` and publish the SES Easy DKIM DNS records. DKIM CNAME records do not replace Zoho MX records.
3. Configure an SES custom MAIL FROM subdomain such as `bounce.biglittlebusiness.com`. SES will provide the specific MX and SPF records for this **subdomain**. These are separate from the parent domain’s Zoho MX records.
4. Maintain one correctly managed parent-domain SPF record. Add authorised senders only with DNS-administrator review; never create competing SPF TXT records.
5. Publish and monitor a DMARC record for `biglittlebusiness.com`. Start in monitoring mode and progress enforcement only after all legitimate senders, including Zoho and SES, are aligned.

## CivicPath Pulse default routing

The initial Council Portfolio Readiness Pulse configuration should be:

| System Admin → Lead routing field | Initial production value |
|---|---|
| From name | `CivicPath` |
| From email | `hello@biglittlebusiness.com` |
| Reply-to email | `hello@biglittlebusiness.com` in Zoho Mail |
| Internal lead-alert email | `kristian@biglittlebusiness.com` |
| AWS region | The selected SES production region, initially expected to be `ap-southeast-2` unless a different verified region is chosen. |
| CRM webhook | Disabled until the HTTPS receiver, signature verification and idempotency test pass. |

Transactional delivery remains disabled until the SES identity, production access, sender credential, suppression controls and end-to-end delivery test are complete. Optional marketing communication remains disabled in practice until CivicPath provides a tested unsubscribe and preference-management flow.

## AWS S3 storage standard

CivicPath documents, evidence and future generated exports must be stored in a dedicated private S3 bucket. The bucket name should identify the product, environment and AWS account but must not reveal customer data. Enable Block Public Access, default server-side encryption, versioning, lifecycle rules and access logging or CloudTrail data-event coverage. Give the API identity only the minimum bucket and object-prefix actions required; do not grant public object access or account-wide S3 permission.

S3 is the source of truth for application files. Binary Lane local disk is not a durable customer document store, and Zoho mailboxes are not an application document repository. File metadata and authorised object keys belong in the CivicPath database; direct object access should use short-lived, authorised URLs or an authenticated application download route.

## Operations record

Every future CivicPath instruction, launch checklist, deployment document and administrator configuration guide should apply this service model unless the product owner explicitly changes it. It does not authorise configuration of any external credentials or services by itself; each service remains disabled until separately configured, tested and approved.
