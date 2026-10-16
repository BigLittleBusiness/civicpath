# Internal Collaboration Workspaces

## Purpose and boundary

CivicPath collaboration is an **internal Council working layer** around strategy actions, delivery dependencies, quarterly updates, funding opportunities and Review Packs. It helps regional councils preserve the context behind a project pathway without replacing formal Council approvals, records systems or partner communication channels.

> This release is deliberately **internal-first**. It does not create external partner accounts, public links, browser-accessible evidence stores, anonymous consultation, or automatic external emails.

Every collaboration record is tenant-scoped and written through authenticated API routes. Existing Council roles remain the access boundary: Organisation Administrators and Portfolio Managers manage structured setup; Contributors can add permitted delivery context; Executives retain read-only visibility.

## What is included

| Capability | Council use | Control boundary |
|---|---|---|
| Action working groups | Name accountable, contributing, reviewing, approving, consulted and informed Council users. | Users must be active in the same Council tenant. |
| Internal notes and replies | Preserve delivery context, rationale, handover notes and focused internal discussion. | Notes, mentions and replies are authenticated and audited; no public links. |
| Contribution requests | Ask an internal colleague for an update, evidence, review, decision input or handover response. | A requested user or a manager may respond; notifications are in-app records. |
| Dependency handovers | Request and accept ownership across teams; retain response, proposed date and a lightweight RACI map. | Only the nominated recipient or a manager may respond; an accepted handover updates the recorded owner. |
| Quarterly update workflow | Draft → submitted for review → changes requested or endorsed → included in report. | A quarterly report uses only updates marked **included in report**. Existing historical updates remain included during migration. |
| Partner commitments | Record the concrete contribution, internal owner, due date, evidence note and status required from a partner. | External contacts are context only; no partner portal is created. |
| Funding collaboration rooms | Coordinate eligibility, evidence, finance and executive review checkpoints for a funding opportunity. | Council users only; linked to the action and optional existing funding position. |
| Engagement plans | Record purpose, audience, IAP2-style participation level, methods, findings, decision impact and closure message. | This is a planning and audit record, not a public consultation tool. |
| Decision Packs | Assemble a decision question, recommendation, options, financial implications, evidence and internal input requests. | Internal only; no public export or external share route is provided. |
| Review Packs | Prepare weekly delivery, monthly leadership, quarterly executive or partner-coordination meetings from live records; capture questions and owned outcomes. | Packs are marked `internalOnly`; outcomes retain links to the underlying Council delivery record. |
| Personal watch list | Follow actions, projects, decisions, funding positions and Review Packs with a stored immediate/daily/weekly preference. | The first release records in-app notifications and preferences only; it does not send unapproved email digests. |

## Review Pack use

A Review Pack is the default mechanism for a structured internal meeting. It can include decisions, critical dependencies, risks, included quarterly updates, projects, funding positions and partner commitments. Staff should:

1. Select the appropriate template and confirm the desired outcome.
2. Check that the items are current and based on recorded evidence.
3. Add pre-reading questions for named Council users.
4. During the meeting, record decisions, follow-up actions and accountable owners.
5. Link each outcome to an existing action, project, dependency, risk, decision, funding position or partner commitment where relevant.
6. Close or archive the pack only after all material outcomes have been recorded in the live delivery register.

The meeting pack is a facilitation aid; formal delegations, Council resolutions and statutory records remain governed by the Council's established processes.

## Suggested operating rhythm

| Rhythm | Recommended use |
|---|---|
| Weekly delivery huddle | Review owner requests, blockers, accepted handovers, open commitments and the next seven-day actions. |
| Monthly leadership review | Use a Review Pack for material dependencies, risks, funding readiness and decisions requiring executive direction. |
| Quarterly executive review | Endorse the relevant action updates before marking them included in the report, then create a Quarterly Executive Review Pack for choices and follow-through. |
| Funding opportunity checkpoint | Use a Funding Room for eligibility, evidence, partner contribution, finance and submission checkpoints rather than a fragmented email trail. |
| Engagement checkpoint | Record the chosen participation level before engagement, then capture findings, the decision impact and the closure message when complete. |

## Security and deployment

- Migration `014_collaboration_workspaces.mjs` is additive only. It creates new collaboration tables and adds workflow fields without deleting or reshaping existing Council records.
- All created, changed, submitted, reviewed, handed-over and outcome-recorded events use CivicPath's audit service.
- Row access is constrained by `organizationId`; controller checks verify every referenced action, project, user, strategy, reporting period and source record belongs to the active tenant.
- In-app notifications avoid sending unapproved messages. Any future email or Teams-style integration must be Council-approved and use an explicit notification policy.
- Production deployment must run `npm run db:migrate` before the API and frontend release. Validate the internal collaboration flow in a non-production Council tenant first.
