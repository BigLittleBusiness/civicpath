# Strategy Delivery Workspace

## Purpose

The **Strategy Delivery Workspace** turns an adopted council strategy into a tenant-scoped, decision-ready operating view. It is designed for regional councils that need to connect an action register to the projects, dependencies, evidence, funding positions and quarterly updates that explain whether delivery is moving.

> CivicPath records council-supplied delivery information. It does not infer impact, guarantee funding or publish a claim without an authorised council decision.

The implementation is a CivicPath Core capability. It is separate from, but can link to, the optional GrantMaestro lifecycle where a funding opportunity or grant record adds useful context.

## What is included

| Area | What CivicPath records | Why it is useful |
|---|---|---|
| Strategy register | Strategy reference, version, term, focus areas and action wording | Preserves the adopted source while creating a usable delivery register. |
| Action delivery | Owner, contributing teams, pathway, status, readiness, target date, next step and next decision | Makes accountability and the next move visible. |
| Project links | Primary, contributing, evidence and dependency links to existing portfolio projects | Avoids a second project list and supports portfolio-level review. |
| Milestones | Due date, owner, completion evidence and variance explanation | Shows whether delivery is progressing rather than merely active. |
| Dependencies | Action, project or milestone dependencies with severity, owner, due date, work-around and resolution evidence | Makes critical-path constraints explicit and reviewable. |
| Quarterly reporting | Period, action update, movement, achievements, evidence, risks, decisions and next-quarter commitment | Captures the information once for officer, leadership and Council reporting. |
| Decision, risk and issue register | Accountable decision-maker, due date, mitigation and follow-up | Directs discussion to the choices or interventions needed. |
| Evidence, measure and funding context | Links, indicator values, cadence, baselines, targets and funding positions | Keeps reported progress grounded in an evidence trail. |
| Alerts and snapshots | In-app attention alerts and immutable report snapshots | Supports a consistent accountability rhythm and audit trail. |

## Recommended operating rhythm

1. **Set up the strategy:** Record the adopted title, reference, version, term and reporting cadence. Add focus areas using the strategy's own language.
2. **Establish the register:** Import a CSV or create actions individually. Assign an owner, next step, readiness position and decision date where known.
3. **Link the delivery chain:** Link existing portfolio projects, add milestones and nominate dependencies. Use **critical** only when the dependency needs leadership-level resolution or close monitoring.
4. **Run the quarter:** Use the action detail to capture movement, evidence, risks, decisions and next-quarter commitments. Keep free text focused on decision value.
5. **Prepare the review:** The Quarterly Report view consolidates recorded status, update coverage, attention items, focus-area mix and latest narratives. It remains a data-led draft for officer review.
6. **Record the record:** Save a report snapshot after the relevant review. A snapshot is deliberately immutable; corrections belong in the live register and the next report snapshot.

## Controlled status model

Each strategy starts with a concise, clear status set:

| Status | Intended meaning |
|---|---|
| Not started | Work has not yet begun or lacks a defined commencement step. |
| On track | Recorded delivery is consistent with the current path and target. |
| Attention required | A material risk, dependency, variance or decision requires active management. |
| Off track | Current delivery is not consistent with the agreed path or target. |
| Complete | The action is complete according to recorded council evidence. |

The status colour is not a substitute for the explanatory update. Use the quarterly narrative and evidence fields to describe *why* the status is appropriate.

## CSV action register import

The Action register supports a reviewed CSV import. The file must include `title`; all other columns are optional:

```csv
action_code,title,description,focus_area,owner_email,delivery_pathway,status,target_date,next_step,next_decision,readiness_score,budget_status
1.1,Coordinate workforce housing pathway,Prepare the preferred delivery option,ED-02,owner@council.gov.au,partnership,attention,2027-06-30,Complete delivery-options brief,Select preferred model,72,indicative
```

The preview validates the file and uses the same parsed rows for commit. Imported action records are private to the active council tenant. **Review all imported ownership, status and dates before using them in a quarterly report.**

## Alerts

The API generates in-app alerts on weekdays for:

- a critical dependency with no owner;
- a critical dependency at or past its escalation date;
- an overdue milestone;
- a decision due for consideration;
- a measure update due by its selected cadence; and
- a missing action update after the reporting-period due date.

Alerts do not send email or make any external notification in this release. This avoids unapproved notification behaviour while the council establishes its escalation policy. Platform and council administrators can resolve or dismiss alerts through the authenticated API; the alert generator resolves an alert when the underlying condition no longer applies.

## Access, tenancy and audit

- Every record carries `organizationId` and is retrieved through signed tenant claims.
- All mutation endpoints confirm parent strategy, action, project, owner and period relationships belong to the same organisation.
- `org_admin` and `portfolio_manager` can set up strategy configuration; contributors can maintain delivery records where the route allows it.
- Mutations use the existing CivicPath audit service. Report snapshots keep their rendered data and counts at the time of preparation.
- Demonstration records are labelled as illustrative and are only seeded into the protected demo tenant.

## Deployment

Migration `009_strategy_delivery_workspace.mjs` must run after migrations `001`–`008`. The Binary Lane deployment script runs it in sequence. See `docs/BINARY_LANE_DEPLOYMENT.md` for the production runbook.
