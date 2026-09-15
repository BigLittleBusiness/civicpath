# CivicPath structured selector schema

## Purpose

This schema provides governed selectors for Council Proof and the wider CivicPath portfolio. It supports platform-managed options, council-specific additions, non-destructive retirement of historic options, explicit `Other` values, and repeatable multi-select project constraints. Existing enum-backed fields remain in place during the transition so no current projects, reporting or APIs are broken.

## Governance model

| Layer | Storage | Intended use |
|---|---|---|
| Platform catalogue | `SelectorOptionSet` and `SelectorOption` with a null `organization_id` | Consistent cross-council terms, reporting and default onboarding controls. |
| Council customisation | `OrganizationSelectorOptionOverride` | Hides or relabels a platform option for one council without changing historic data. |
| Council-specific option | `SelectorOption` with the council `organization_id` and `is_custom=true` | Adds a reusable local term while preserving the shared platform catalogue. |
| One-off Other entry | `ProjectSelectorValue.other_value` or `ProjectConstraint.other_value` | Retains the project-specific wording selected through the `Other` option. |

Platform options must never be hard-deleted once used. They may be marked `deprecated` or `retired`; historic records retain the selected option ID and label can be rendered with a retirement notice. Council-specific options follow the same rule. An `Other` value is not silently promoted into a reusable dropdown option; an authorised council user must explicitly create a custom option if it is to be reused.

## Core tables

| Table | Purpose | Key integrity controls |
|---|---|---|
| `SelectorOptionSet` | Defines a selector, including its code, target entity, single/multi mode and `Other` policy. | Unique `organization_id + code`; platform rows use `organization_id = NULL`. |
| `SelectorOption` | Stores platform and council-specific selectable values. | Unique `option_set_id + organization_id + code`; status protects history. |
| `OrganizationSelectorOptionOverride` | Stores a council's label or visibility override for a platform value. | Unique `organization_id + option_id`. |
| `ProjectPriority` | Allows a project to link to several council priorities while preserving an existing primary priority. | Unique `project_id + priority_id`; `is_primary` marks the main alignment. |
| `ProjectSelectorValue` | Stores ordinary project selector answers, including multi-select values and `Other` text. | Unique `project_id + option_set_id + option_id`; application validation enforces set cardinality. |
| `ProjectConstraint` | Stores action-oriented constraints, their severity, resolution status, owner, due date and one-off Other wording. | Unique `project_id + constraint_key`; prevents duplicate active constraints. |

## Selector sets seeded by migration 004

The migration creates platform defaults for team size, Council Proof pathway, project category, delivery stage, readiness-level guidance, funding pathway type, known constraints, constraint severity and constraint status. It also adds an ISO currency code to organisations, projects, funding pathways and grants. The UI should format local currency values with the organisation default—AUD or NZD—while the database stores decimal amounts and currency code separately.

## Validation rules

The service layer must resolve the council-specific selector set or platform default, then validate that each option is active, belongs to that set and is not hidden for that council. It must enforce single versus multi-select limits transactionally. `Other` text is permitted only when the selected option has `is_other=true`, and must be required for that option. The normalised text is stored for duplicate detection but the original wording is retained for user-facing output.

Constraint records are intentionally more detailed than ordinary selector values. A selected constraint requires a severity and status option; an owner and due date should be required by the application when severity is `critical`. Any option creation, override, retirement or constraint-state change must write an `AuditLog` entry from its controlling API.

## Rollout sequence

Run `004_structured_selectors.mjs` after migrations 001–003. The migration is idempotent, creates the schema, backfills `ProjectPriority` from existing `CivicProject.priority_id` values and seeds the platform catalogue. Future API and UI work should read the catalogue rather than expanding database enums, then gradually map existing enum-backed category, stage and funding-type fields to the corresponding selectors.
