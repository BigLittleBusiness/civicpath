# Council Proof controlled-input workflow

## Purpose

Council Proof now reads governed options from the tenant-scoped selector catalogue instead of embedding project types, delivery stages or known constraints in the browser. The Portfolio page uses searchable selection controls for the initial project baseline, supports several strategic priorities, records multi-select constraints with severity and status, and visibly prefixes monetary inputs with a dollar symbol and the council's stored currency code.

## Tenant API contract

All routes below require a CivicPath session. The existing tenant middleware derives the organisation boundary from the signed session; callers cannot supply or override an organisation identifier.

| Route | Purpose | Access |
|---|---|---|
| `GET /v1/council-proof/selectors` | Returns the active platform and council-specific selector catalogue, with tenant overrides applied, plus the council currency code. | Any authenticated council user. |
| `GET /v1/projects/:projectId/council-proof` | Returns a project with linked priorities, controlled selector values and structured constraints. | Any authenticated council user in the project tenant. |
| `PUT /v1/projects/:projectId/selectors/:selectorCode` | Replaces values for one project selector set after validating cardinality, tenant visibility and any `Other` wording. | Organisation administrator or portfolio manager. |
| `GET /v1/projects/:projectId/constraints` | Lists structured constraints for a project. | Any authenticated council user in the project tenant. |
| `POST /v1/projects/:projectId/constraints` | Adds a governed project constraint with severity, status, optional owner and context. | Organisation administrator, portfolio manager or contributor. |
| `PATCH /v1/projects/:projectId/constraints/:constraintId` | Updates a constraint's controlled severity/status and accountable details. | Organisation administrator, portfolio manager or contributor. |

The `POST /v1/projects` project creation request now accepts optional `priorityIds`, a controlled `categorySelection`, a controlled `stageSelection`, and an array of `constraintSelections`. Those values are persisted in one transaction. A council's default currency is used when an API caller does not provide an allowed currency code.

## Form behaviour

The first Council Proof project form has four intentional behaviours. Project category and delivery stage are searchable controlled selections. Strategic priorities can be found and added one at a time, with the first selected priority retained as the current primary relationship for compatibility with existing reporting. Known constraints are multi-select records, each with a governed severity and status rather than a single unstructured risk note. Amounts are stored as decimals plus currency code, but presented with a dollar prefix and a visible `AUD` or `NZD` marker.

The `Other` option remains available only where explicitly enabled by the selector catalogue. Selecting it reveals a short description field. The wording is stored against the individual project or constraint; it does not become a new reusable dropdown choice unless an authorised council user later creates a council-specific option through the governed catalogue.

## Validation and audit behaviour

The selector service validates that a selected option belongs to the requested selector set, is active and is not hidden by a tenant override. It enforces single-select and multi-select limits, validates `Other` input, and rejects cross-tenant project access. Project category and delivery-stage replacements also keep the existing enum-backed fields in sync so current portfolio views and reports continue to work while the platform transitions to catalogue-driven inputs.

Project creation, selector replacement, constraint creation and constraint updates write audit records. The Council Proof API smoke test creates an isolated demo project, verifies selector catalogue access, persists priority/selector/constraint values, confirms cross-tenant denial, synchronises the delivery-stage field, and removes its own test data.
