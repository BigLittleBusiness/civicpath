# CivicPath build baseline

## Confirmed decisions

| Decision | Confirmed direction |
| --- | --- |
| Product shape | CivicPath is an independent product with optional API-level interoperability with GrantMaestro. |
| Product scope | CivicPath Core and a complete grant-lifecycle workspace are included. |
| Demonstration data | A dedicated demonstration organisation contains realistic, clearly labelled sample records. No sample records are created in a customer organisation. |
| Production hosting | Binary Lane will host the application at `app.civicpath.com.au`. |
| Marketing site | The public marketing site will use `www.civicpath.com.au`. |
| Backend stack | Node.js, Express, MySQL 8, Sequelize, Nginx and PM2. |
| Frontend stack | Create React App, React, Redux Toolkit, React Router, Formik/Yup, Axios and Recharts. |
| Security baseline | HttpOnly JWT cookie sessions, tenant-scoped queries, role checks, audit entries, request limiting, Helmet headers, validation and production HTTPS-only cookies. |

## Sample-data rule

Demonstration data belongs only to the `demo` organisation. When a customer imports data, it is loaded into their own empty organisation. A dedicated organisation administrator can reset only the demonstration workspace; customer data is never silently deleted or replaced.

## Deferred production dependencies

The first runnable build does not require SES, S3, Stripe or an AI provider. Each is represented by a configuration boundary and must be enabled only after environment-specific credentials, privacy review and end-to-end testing are complete.

