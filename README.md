# CivicPath Application

CivicPath is a standalone SaaS application for regional councils in Australia and New Zealand. It helps teams connect Council priorities to delivery-ready projects, funding pathways, decisions, risks, actions and grant-lifecycle work.

## Product boundary

CivicPath is a separate product from GrantMaestro. It has its own application, API, database and deployment configuration. It is deliberately compatible with GrantMaestro’s technology choices and will later support optional interoperability through documented API contracts, not shared database tables.

## Technology baseline

The application follows the established GrantMaestro stack: a Create React App single-page application with React, Redux Toolkit, React Router, Formik/Yup, Axios, Recharts and React Helmet; a Node.js/Express ES-module API under `/v1`; MySQL 8 through Sequelize; Nginx static hosting and reverse proxying; PM2 process management; JWT authentication in HttpOnly cookies; AWS SES/S3-ready adapters; Stripe-ready billing adapters; and scheduled notifications through node-cron.

## MVP modules

The initial build includes organisation tenancy, role-based access, audit entries, strategic priorities, projects, project-readiness assessments, funding pathways, actions, risks, decisions, grants, grant tasks, evidence items, portfolio reports, CSV imports and a clearly marked demonstration workspace. It contains no shared GrantMaestro database dependency.

## Deployment target

Production will be deployed to Binary Lane with `app.civicpath.com.au` serving the application and `www.civicpath.com.au` serving the marketing website. Binary Lane access, DNS records, SSL certificates and production credentials have not yet been supplied, so this repository includes deployment-ready configuration but does not alter live hosting.

## Development commands

Run the API from `api` using `npm run dev` and the frontend from `frontend` using `npm start`. Copy each `.env.example` file to `.env` and configure only development values. Do not commit credentials.

