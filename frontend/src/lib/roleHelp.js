/*
 * CivicPath role-aware help library.
 * This contains only non-sensitive guidance. It does not grant access or replace
 * server-side role controls; the logged-in user's role selects the appropriate view.
 */
export const ROLE_HELP = {
  "platform_admin": {
    "label": "System Administrator",
    "summary": "Platform operations, customer oversight, controlled configuration and accountable support.",
    "topHelpIds": [
      1,
      2,
      3,
      4,
      5,
      6,
      7,
      8,
      9,
      10
    ],
    "faqs": [
      {
        "id": 1,
        "question": "1. How do I sign in as a System Administrator for the first time?",
        "answer": "Use the System Administrator sign-in page with your active account. CivicPath requires an authenticator-app setup before a System Administrator can access platform controls; scan the QR code, confirm a current code and store the recovery codes in the Council-approved secure location."
      },
      {
        "id": 2,
        "question": "2. How do I complete System Administrator MFA at sign-in?",
        "answer": "Enter a current code from the authenticator app, or a valid unused recovery code. The pending MFA step is short-lived and is tied to your current active account and session version."
      },
      {
        "id": 3,
        "question": "3. What should I do if I lose access to my authenticator app?",
        "answer": "Use one of the recovery codes issued at MFA enrolment. If no recovery code is available, treat it as a security incident and use the approved internal recovery process; do not share passwords or codes through ordinary email or a support form."
      },
      {
        "id": 4,
        "question": "4. How do I reset a System Administrator password?",
        "answer": "Use Forgot password and complete the protected reset flow. A reset link is single-use and expires after one hour. Completing a reset signs out existing sessions and invalidates any pending MFA challenge."
      },
      {
        "id": 5,
        "question": "5. Why is my MFA challenge no longer valid?",
        "answer": "A pending MFA challenge expires quickly and is invalidated if the account is disabled or its session version changes, including after a password reset. Sign in again to begin a fresh challenge."
      },
      {
        "id": 6,
        "question": "6. Why can I not access System Admin after entering my password?",
        "answer": "System Administrator access requires both a correct password and completed MFA. Check that the authenticator device time is set automatically, enter a current code and sign in again if the pending challenge has expired."
      },
      {
        "id": 7,
        "question": "7. Where can I see the most urgent platform work?",
        "answer": "Open System Admin → Command centre. The operational queue and headline metrics show billing attention, Council Proofs nearing their end, open support cases, pending checkouts and other priority signals."
      },
      {
        "id": 8,
        "question": "8. How do I find a particular council account?",
        "answer": "Open System Admin → Councils and search by council name, country, plan, billing contact or primary administrator. Use the status filters to focus on active, Council Proof, attention or ended accounts."
      },
      {
        "id": 9,
        "question": "9. What is Customer 360° used for?",
        "answer": "Open a council from the Councils register to view its subscription, invoices, users, authorised contacts, support cases, account status and recent activity in one controlled panel."
      },
      {
        "id": 10,
        "question": "10. How do I check a council’s current plan and access period?",
        "answer": "Open the council’s Customer 360° record and select Billing. The panel shows the current plan, subscription status, renewal or end date, payment context and any cancellation-at-period-end flag."
      },
      {
        "id": 11,
        "question": "11. How do I change a council’s annual plan?",
        "answer": "In Customer 360° → Billing, choose the available annual plan and request the change. CivicPath requires a fresh password-and-authenticator step-up before it sends the controlled change request to Stripe."
      },
      {
        "id": 12,
        "question": "12. How do I cancel a subscription?",
        "answer": "In Customer 360° → Billing, choose At period end or Immediately, enter an internal reason and complete the fresh password-and-MFA step-up. Immediate cancellation removes workspace access; period-end cancellation preserves access until the recorded end date."
      },
      {
        "id": 13,
        "question": "13. How do I process a refund?",
        "answer": "Open the paid invoice in Customer 360° → Billing, enter the internal refund reason and complete fresh password-and-MFA step-up. Stripe returns funds to the original payment method; a refund does not silently cancel an active subscription."
      },
      {
        "id": 14,
        "question": "14. Why is an online checkout blocked?",
        "answer": "CivicPath deliberately blocks checkout until Stripe configuration is complete. Confirm the intended test or live keys, webhook signing secret, all CivicPath Price IDs and Stripe Tax/automatic-tax setting are correctly configured before retrying."
      },
      {
        "id": 15,
        "question": "15. How do I configure Stripe safely?",
        "answer": "Use System Admin → Billing & Stripe. Begin in test mode, save the required keys, webhook secret, plan Price IDs and Stripe Tax setting, then complete the documented test checkout, webhook, invoice, refund and portal checks before any approved live-mode change."
      },
      {
        "id": 16,
        "question": "16. Can I view Stripe secret keys after saving them?",
        "answer": "No. CivicPath retains secret values encrypted at rest and does not display them after saving. Leave a secret field blank when editing unrelated fields to retain the stored value."
      },
      {
        "id": 17,
        "question": "17. How do I tell whether an email or invitation was sent?",
        "answer": "Use System Admin → Message delivery. It records safe delivery outcomes and retry guidance for transactional messages without storing message bodies, reset links or invitation links."
      },
      {
        "id": 18,
        "question": "18. What should I do when a password-reset or invitation email fails?",
        "answer": "Correct the relevant configuration or recipient issue, then ask the user to start the secured reset flow again or resend a fresh invitation. Do not replay a historical reset or invitation link."
      },
      {
        "id": 19,
        "question": "19. How do I manage a support case?",
        "answer": "Use System Admin → Support desk. Review the category, priority and response target; move the case into progress when work starts, update its priority where required and set an appropriate status such as waiting on customer, resolved or closed."
      },
      {
        "id": 20,
        "question": "20. What do the support response targets mean?",
        "answer": "New cases receive a category-aware first-response target: urgent within 4 business hours, high within 8 business hours, normal within 1 business day and low within 3 business days. Moving a case into progress records the first response."
      },
      {
        "id": 21,
        "question": "21. How do I access a support attachment safely?",
        "answer": "Open the case in System Admin → Support desk and use the authenticated attachment link. Attachments are private and must not be copied to public links or handled outside the approved support process."
      },
      {
        "id": 22,
        "question": "22. How do I manage public enquiries?",
        "answer": "Use System Admin → Public enquiries to filter and review enquiries by category and follow-up state. Public contact is form-based and protected; do not publish or expose operational mailbox addresses."
      },
      {
        "id": 23,
        "question": "23. What is Lead routing for?",
        "answer": "Lead routing manages the controlled configuration and operational view for Readiness Pulse or other captured-lead hand-off. Confirm the intended route and signed webhook configuration before relying on automated routing."
      },
      {
        "id": 24,
        "question": "24. What is the Security trail?",
        "answer": "System Admin → Security trail shows auditable operational events. Use it to understand who performed a controlled action, when it occurred and its non-secret context; it is not a substitute for formal incident investigation records."
      },
      {
        "id": 25,
        "question": "25. How do I suspend or reactivate a council tenant?",
        "answer": "Use Customer 360° → Account, enter a written reason and complete fresh password-and-MFA step-up. Do not manually override a billing-driven access state without first confirming the current Stripe and support context."
      },
      {
        "id": 26,
        "question": "26. Can I edit a council’s users for them?",
        "answer": "Customer 360° shows user status and history, but a council’s Organisation Administrator manages its People & access controls. Use platform intervention only through the approved, audited support and security process."
      },
      {
        "id": 27,
        "question": "27. How should I handle a suspected data, access or security issue?",
        "answer": "Prioritise the case as urgent, preserve the relevant audit and delivery evidence, limit access where required through the approved controls, and follow the internal incident-response process. Do not request passwords, MFA codes or card details from the customer."
      },
      {
        "id": 28,
        "question": "28. How do I know whether a feature is actually live?",
        "answer": "Check the relevant configuration and verified operational evidence. CivicPath must not be represented as sending email, taking payments, storing attachments or operating a live integration until the required service has been configured and end-to-end tested."
      },
      {
        "id": 29,
        "question": "29. Why are System Administrator actions more restrictive than council-user actions?",
        "answer": "Platform controls can affect customer access, billing or sensitive configuration. CivicPath therefore requires mandatory MFA and a fresh password-plus-MFA step-up for privileged actions, with audit records for accountability."
      },
      {
        "id": 30,
        "question": "30. Where should I direct a user who needs product help?",
        "answer": "Ask them to use the protected in-product support form and select the closest category. That creates a tenant-context support case and allows them to attach approved supporting files without exposing public contact addresses."
      }
    ]
  },
  "org_admin": {
    "label": "Organisation Administrator",
    "summary": "Council workspace ownership, people and access, account continuity, subscription visibility and guided setup.",
    "topHelpIds": [
      1,
      2,
      3,
      4,
      5,
      6,
      7,
      8,
      9,
      10
    ],
    "faqs": [
      {
        "id": 1,
        "question": "1. How do I access our new CivicPath workspace?",
        "answer": "Complete the registration and Stripe Checkout journey, then wait for CivicPath to verify the payment event. The workspace is activated only after verified payment; an Organisation Administrator receives an activation message when transactional email is configured."
      },
      {
        "id": 2,
        "question": "2. Why can I not sign in after registration?",
        "answer": "A newly registered workspace remains unavailable until the selected Stripe payment is verified. If checkout was not completed or payment did not verify, return to the approved registration or billing path rather than creating a duplicate account."
      },
      {
        "id": 3,
        "question": "3. How do I start the Council Proof conversion to an annual plan?",
        "answer": "In Workspace settings → Subscription, use the Council Proof upgrade path during the eligible window. It applies the $495 Council Proof credit once to the supported annual Checkout when the policy conditions are met."
      },
      {
        "id": 4,
        "question": "4. Where do I view our plan, invoices and access period?",
        "answer": "Open Workspace settings → Subscription. All council roles can view current plan context; the Organisation Administrator can use the available billing controls and the secure Stripe Customer Portal where it has been configured."
      },
      {
        "id": 5,
        "question": "5. How do I update payment details or download invoices?",
        "answer": "Use Workspace settings → Open secure billing portal. Stripe hosts payment-method, billing-detail, tax-ID and invoice functions; CivicPath does not store card details."
      },
      {
        "id": 6,
        "question": "6. How do I invite another council staff member?",
        "answer": "Open Workspace settings → People & access, select Invite Council user, enter the person’s work details and choose the appropriate role. The recipient receives a one-time password-setup invitation when transactional delivery is configured."
      },
      {
        "id": 7,
        "question": "7. What roles can I assign to a council user?",
        "answer": "You can invite Organisation Administrators, Portfolio Managers, Contributors and Executives. Assign the least-privileged role that matches the person’s delivery responsibility; Executive is read-only."
      },
      {
        "id": 8,
        "question": "8. How do I create a backup administrator?",
        "answer": "Invite an additional active Organisation Administrator through People & access. Keeping at least two active Organisation Administrators is the recommended continuity safeguard for leave, turnover and emergency access."
      },
      {
        "id": 9,
        "question": "9. Why can I not invite another person?",
        "answer": "Active users and pending invitations consume the plan’s workflow-user allowance. Review the People & access seat summary, remove an unnecessary pending or active user, or use the approved subscription path if the team needs more capacity."
      },
      {
        "id": 10,
        "question": "10. What should I do if an invited staff member has not received the email?",
        "answer": "Confirm the work email, then use Resend in People & access. Resending creates a fresh one-time link and invalidates the previous one. If delivery remains unavailable, check with the System Administrator whether transactional email is configured."
      },
      {
        "id": 11,
        "question": "11. What happens when an invitation expires?",
        "answer": "Invitations expire after seven days. Use Resend to issue a fresh invitation; the original link cannot be reused."
      },
      {
        "id": 12,
        "question": "12. How does an invited person create their account?",
        "answer": "They open the one-time invitation link, review the displayed council and role details, choose a password that meets the required standard and submit it. Their account becomes active and the invitation is consumed."
      },
      {
        "id": 13,
        "question": "13. How do I change someone’s role?",
        "answer": "In People & access, choose the member’s role and select the revised role. CivicPath invalidates that person’s current session so they must sign in again with the new permissions."
      },
      {
        "id": 14,
        "question": "14. Why can I not demote or remove the final Organisation Administrator?",
        "answer": "CivicPath protects account continuity. Promote another active council user to Organisation Administrator first, then complete the role change or access removal."
      },
      {
        "id": 15,
        "question": "15. How do I remove a staff member who has left the council?",
        "answer": "Open People & access, select Remove access and review the person’s active assignments. Choose another active council user to receive any required reassignment, optionally add an internal note, then confirm the controlled removal."
      },
      {
        "id": 16,
        "question": "16. What needs to be reassigned when a staff member leaves?",
        "answer": "CivicPath identifies active operational work such as projects, grants, work items, strategies, actions, milestones, dependencies, decisions, stakeholders, risks/issues and alerts. Historical authorship and audit records remain intact."
      },
      {
        "id": 17,
        "question": "17. Can I remove my own access?",
        "answer": "No. For continuity, another Organisation Administrator must manage a change to your own access after confirming a suitable replacement administrator is active."
      },
      {
        "id": 18,
        "question": "18. How do I set the accountable workspace owner and operating contact?",
        "answer": "Open Workspace settings → Workspace identity. Maintain the council name, operating contact details and accountable workspace owner so responsibility is clear during delivery and support."
      },
      {
        "id": 19,
        "question": "19. How do I import our project register?",
        "answer": "In Workspace settings → Data import, download the project CSV template, prepare the required columns, choose the file and review CivicPath’s preview. Confirm the import only after checking names, ownership, dates and amounts."
      },
      {
        "id": 20,
        "question": "20. How do I import our grant register?",
        "answer": "Grant CSV commits are not enabled in this release. Open Grants to enter council-held records with ownership, source provenance and governed lifecycle stages. Do not treat manual or legacy records as a connected opportunity feed. Project CSV import remains available separately in Workspace settings."
      },
      {
        "id": 21,
        "question": "21. Why was my CSV import rejected?",
        "answer": "Use the matching CivicPath template, confirm it is a CSV file and correct missing or invalid prescribed columns. Review the preview before confirmation and correct ownership, dates or amounts that need attention."
      },
      {
        "id": 22,
        "question": "22. How do I add the council’s priorities and projects?",
        "answer": "Use Project portfolio to create priority projects or import an existing register. Organisation Administrators and Portfolio Managers can create and update project records; keep the initial register focused on the council’s priority work."
      },
      {
        "id": 23,
        "question": "23. How do I create a strategy delivery register?",
        "answer": "Open Strategy delivery, record the adopted strategy and its focus areas, then create actions individually or use the controlled action-import flow. Use the strategy’s adopted language and assign an accountable owner, next step and dates where known."
      },
      {
        "id": 24,
        "question": "24. What should we complete first in a new workspace?",
        "answer": "Follow the Guided setup checklist: confirm the workspace owner and operating contact, add or import priority projects, create or import the strategy action register, and invite the colleagues who will own, contribute to or review the work."
      },
      {
        "id": 25,
        "question": "25. How do quarterly reports become ready for leadership review?",
        "answer": "Ensure action updates contain clear movement, evidence, risks, decisions and next-quarter commitments. A nominated reviewer endorses or requests changes, and only an Organisation Administrator or Portfolio Manager can mark an update included in a report."
      },
      {
        "id": 26,
        "question": "26. Can I add an Executive user?",
        "answer": "Yes. Invite the person through People & access with the Executive role. Executives can view the council’s delivery, portfolio, funding, grant and reporting information but cannot change it."
      },
      {
        "id": 27,
        "question": "27. Where do I get help with a workspace issue?",
        "answer": "Use the protected support form in Workspace settings, choose the relevant category and give a concise subject and enough context. Do not include passwords, authenticator codes or payment details."
      },
      {
        "id": 28,
        "question": "28. Can I attach a screenshot or document to a support request?",
        "answer": "Yes. The support form accepts up to three private files, each up to 10 MB, in the supported image, PDF, text, Word or Excel formats. Do not upload passwords, access codes or payment details."
      },
      {
        "id": 29,
        "question": "29. Why can’t I see another council’s information?",
        "answer": "CivicPath isolates each council’s workspace. Your account only accesses records in your organisation; this is an intentional privacy and security control."
      },
      {
        "id": 30,
        "question": "30. What does it mean if our workspace is suspended or access has ended?",
        "answer": "Access can pause after a failed payment, cancellation or approved account-state action. Review Workspace settings → Subscription and use the protected support form if the displayed status does not match your council’s current billing context."
      }
    ]
  },
  "portfolio_manager": {
    "label": "Portfolio Manager",
    "summary": "Portfolio, strategy and reporting setup; delivery coordination; controlled internal collaboration.",
    "topHelpIds": [
      1,
      2,
      3,
      4,
      5,
      6,
      7,
      8,
      9,
      10
    ],
    "faqs": [
      {
        "id": 1,
        "question": "1. How do I get access as a Portfolio Manager?",
        "answer": "An Organisation Administrator invites you through People & access. Accept the one-time invitation, set your password and sign in. If the invitation has expired, ask an Organisation Administrator to resend it."
      },
      {
        "id": 2,
        "question": "2. What can a Portfolio Manager do in CivicPath?",
        "answer": "Portfolio Managers can set up and maintain portfolios and strategies, manage reporting periods, import registers, coordinate delivery and use the internal collaboration controls. They do not manage billing, Stripe settings or platform administration."
      },
      {
        "id": 3,
        "question": "3. How do I create a priority project?",
        "answer": "Open Project portfolio and create a project using the guided fields. Record a clear name, priority, category, stage, delivery context, relevant dates and estimates so the register supports decisions rather than a second unstructured list."
      },
      {
        "id": 4,
        "question": "4. How do I update a project record?",
        "answer": "Open the relevant project and update the permitted details. Keep ownership, stages, dates, readiness information and constraints current so the portfolio view remains decision-ready."
      },
      {
        "id": 5,
        "question": "5. How do I set a project’s controlled selectors?",
        "answer": "Use the project’s selector controls to record the governed pathway, readiness, priorities, stage and other structured information. Choose Other only when the controlled options do not fit, then add the decision-useful context."
      },
      {
        "id": 6,
        "question": "6. How do I record a project constraint?",
        "answer": "Open the project’s constraints area and add the constraint, its owner and the relevant management context. Contributors can also maintain permitted project constraints."
      },
      {
        "id": 7,
        "question": "7. How do I assess project readiness?",
        "answer": "Open the project and use the readiness-assessment control. Review the structured inputs and resulting position with the delivery team; the assessment supports prioritisation and does not guarantee funding or project approval."
      },
      {
        "id": 8,
        "question": "8. How do I import a project or grant register?",
        "answer": "Use Workspace settings → Data imports for the project CSV template, preview and explicit tenant-scoped commit. For grant records, use Grants to add council-entered records with provenance and controlled lifecycle steps. Legacy grant CSV commits are disabled; an old template or preview does not mean that import is available."
      },
      {
        "id": 9,
        "question": "9. How do I create a strategy?",
        "answer": "Open Strategy delivery and record the adopted strategy title, reference, version, term and reporting cadence. Add focus areas using the council’s adopted strategy language."
      },
      {
        "id": 10,
        "question": "10. How do I add actions to a strategy?",
        "answer": "Within the strategy, add actions individually or use the action CSV import. Assign a clear owner, delivery pathway, status, readiness, target date, next step and next decision where known."
      },
      {
        "id": 11,
        "question": "11. How do I import an adopted action register?",
        "answer": "Use the strategy action-import flow. The CSV must include title; review the preview and verify action codes, focus areas, owners, dates and status before committing the import."
      },
      {
        "id": 12,
        "question": "12. How do I link a strategy action to a portfolio project?",
        "answer": "Open the strategy action and add the relevant project link. Use the appropriate link purpose so the council can distinguish primary, contributing, evidence or dependency context."
      },
      {
        "id": 13,
        "question": "13. How do I add a milestone?",
        "answer": "Open the relevant strategy action and add a milestone with its due date, accountable owner, completion evidence and variance explanation. Update it as delivery moves rather than waiting until reporting time."
      },
      {
        "id": 14,
        "question": "14. How do I record a dependency?",
        "answer": "Create the dependency from the strategy or action context, identify what it affects, set severity, owner and due date, and record a practical work-around or resolution evidence. Use critical only where leadership-level resolution or close monitoring is justified."
      },
      {
        "id": 15,
        "question": "15. How do I manage a dependency handover?",
        "answer": "Create a handover request from the dependency and nominate the receiving council user. The nominated recipient or a manager can respond; an accepted handover updates the recorded owner and keeps the response trail."
      },
      {
        "id": 16,
        "question": "16. How do I set up a quarterly reporting period?",
        "answer": "Create the reporting period within the strategy and maintain its dates and due context. Use the period to collect action updates rather than assembling separate reporting documents from email and spreadsheets."
      },
      {
        "id": 17,
        "question": "17. How do I review an action update before it appears in a report?",
        "answer": "Use the quarterly workflow to review the update, endorse it or request changes. Confirm its evidence, risks, decisions and next-quarter commitment are sufficient before marking it included in the report."
      },
      {
        "id": 18,
        "question": "18. Who can mark a quarterly update included in a report?",
        "answer": "Only an Organisation Administrator or Portfolio Manager can mark an endorsed update included. Contributors can prepare and submit updates; executives can view reporting information but cannot change inclusion."
      },
      {
        "id": 19,
        "question": "19. How do I create a report snapshot?",
        "answer": "Open Reports, select the strategy and reporting period, review its genuine evidence-link and included-update metrics, then record a draft snapshot in Snapshot history. It preserves the live register at generation time, not a reconstructed period-end position or formal approval. Use the selected history entry for JSON, CSV or printable HTML; corrections go into a later snapshot."
      },
      {
        "id": 20,
        "question": "20. What alerts should I act on first?",
        "answer": "Review critical unowned or overdue dependencies, overdue milestones, decisions due for consideration, measures due for update and missing action updates after a reporting deadline. Resolve or dismiss alerts only when the underlying condition has been addressed or is no longer applicable."
      },
      {
        "id": 21,
        "question": "21. How do I use an Action Working Group?",
        "answer": "Open the action’s collaboration area and record accountable, contributing, reviewing, approving, consulted and informed internal council users. All participants must be active in the same council workspace."
      },
      {
        "id": 22,
        "question": "22. How do I request an update or evidence from a colleague?",
        "answer": "Create an internal contribution request from the action and nominate the appropriate council user. The recipient or a manager can respond, and the request remains an in-app record rather than an unapproved external email."
      },
      {
        "id": 23,
        "question": "23. How do I use internal action notes?",
        "answer": "Use the action discussion thread for focused delivery rationale, handover context and internal replies. Keep entries concise and decision-relevant; this is an authenticated internal workspace, not a public or partner portal."
      },
      {
        "id": 24,
        "question": "24. How do I record a partner commitment?",
        "answer": "Create a partner commitment against the action, documenting the expected contribution, internal owner, due date, evidence note and status. External contacts are context only; CivicPath does not provide external partner accounts in this release."
      },
      {
        "id": 25,
        "question": "25. How do I coordinate a funding opportunity?",
        "answer": "Use a Funding collaboration room linked to the action and optional funding position. Record eligibility, evidence, finance and executive-review checkpoints so responsibilities are visible in one internal location."
      },
      {
        "id": 26,
        "question": "26. How do I create an engagement plan?",
        "answer": "From the action, record the purpose, audience, participation level, methods, findings, decision impact and planned closure message. It is an internal planning and audit record, not a public consultation tool."
      },
      {
        "id": 27,
        "question": "27. How do I create a Decision Pack?",
        "answer": "Create a Decision Pack when a material question needs a structured recommendation, options, financial implications, evidence and internal input. It remains internal and does not create an external share link."
      },
      {
        "id": 28,
        "question": "28. How do I create a Review Pack?",
        "answer": "Create a Review Pack for a weekly delivery, monthly leadership, quarterly executive or partner-coordination meeting. Add current live items and pre-reading questions, then record owned outcomes linked back to the delivery register."
      },
      {
        "id": 29,
        "question": "29. How do I use my collaboration watch list?",
        "answer": "Follow the relevant action, project, decision, funding position or Review Pack through My collaboration. Set the available immediate, daily or weekly preference; the current release records in-app preferences and does not send unapproved email digests."
      },
      {
        "id": 30,
        "question": "30. Why can’t I change billing or invite council users?",
        "answer": "Those functions are intentionally assigned to the Organisation Administrator. Use the protected support form for a technical issue or ask an Organisation Administrator to manage people, access and billing-related requests."
      }
    ]
  },
  "contributor": {
    "label": "Contributor",
    "summary": "Delivery updates, evidence, risks, dependencies, grant context and internal working collaboration.",
    "topHelpIds": [
      1,
      2,
      3,
      4,
      5,
      6,
      7,
      8,
      9,
      10
    ],
    "faqs": [
      {
        "id": 1,
        "question": "1. How do I get access as a Contributor?",
        "answer": "Accept the secure one-time invitation sent by an Organisation Administrator, set a compliant password and sign in. If the invitation has expired or was not received, ask the Organisation Administrator to resend it."
      },
      {
        "id": 2,
        "question": "2. What can I do as a Contributor?",
        "answer": "Contributors can maintain permitted delivery records and internal collaboration context, including action updates, risks, issues, dependencies, milestones, evidence, funding context, grants and work items. They cannot manage users, billing, strategy setup or report inclusion."
      },
      {
        "id": 3,
        "question": "3. How do I find work assigned to me?",
        "answer": "Open My collaboration to view your relevant requests, notifications and watched records, then use the portfolio, strategy or grant workspace to open the associated item."
      },
      {
        "id": 4,
        "question": "4. How do I update a strategy action?",
        "answer": "Open the action and update the permitted delivery fields with the current status, next step, risks, decision context or other information you are responsible for. Keep statements specific to recorded council evidence."
      },
      {
        "id": 5,
        "question": "5. How do I submit a quarterly action update?",
        "answer": "Open the reporting-period action-update area, record movement, achievements, evidence, risks, decisions and the next-quarter commitment, then submit it for review. The update is not automatically included in a report."
      },
      {
        "id": 6,
        "question": "6. Can I mark my quarterly update included in the report?",
        "answer": "No. A nominated reviewer can endorse or request changes, but only an Organisation Administrator or Portfolio Manager can mark an update included in the quarterly report."
      },
      {
        "id": 7,
        "question": "7. What should I do if a reviewer requests changes?",
        "answer": "Open the submitted update, address the requested clarification or evidence in the live record and resubmit according to the council’s reporting rhythm. Do not create a separate conflicting version in email."
      },
      {
        "id": 8,
        "question": "8. How do I add a risk or issue?",
        "answer": "Create the risk or issue from the strategy context, then record the relevant owner, due date, mitigation and follow-up. Use clear factual wording so the item can be acted on and reviewed."
      },
      {
        "id": 9,
        "question": "9. How do I add or update a dependency?",
        "answer": "Create or update the dependency from the strategy area, describe the constraint, set its severity and owner, and document the work-around, escalation date or resolution evidence where relevant."
      },
      {
        "id": 10,
        "question": "10. How do I respond to a dependency handover?",
        "answer": "Open the handover request in your collaboration work, review the proposed owner and date, then accept or respond with the necessary context. Only the nominated recipient or a manager can respond."
      },
      {
        "id": 11,
        "question": "11. How do I add a milestone or completion evidence?",
        "answer": "Open the relevant strategy action and create or update the milestone. Add the due date, owner, completion evidence and any variance explanation so delivery status is understandable at review time."
      },
      {
        "id": 12,
        "question": "12. How do I add evidence to an action?",
        "answer": "Use the evidence-link control to record the relevant evidence reference or source context. Keep the link and note specific enough for an internal reviewer to understand why the delivery position has been recorded."
      },
      {
        "id": 13,
        "question": "13. How do I record a measure or indicator update?",
        "answer": "Add the measure from the action context and record the current indicator information, cadence, baseline or target where available. Update it in line with the council’s agreed evidence rhythm."
      },
      {
        "id": 14,
        "question": "14. How do I add a stakeholder record?",
        "answer": "Add the internal stakeholder context from the action and maintain the relevant role, relationship or engagement information. This does not create an external account or public contact channel."
      },
      {
        "id": 15,
        "question": "15. How do I record a funding position?",
        "answer": "Create a funding position from the action to capture funding relevance and internal context. Use it to support coordination; CivicPath does not guarantee funding or replace the council’s formal approval process."
      },
      {
        "id": 16,
        "question": "16. How do I add a grant record?",
        "answer": "Open Grant lifecycle and create the permitted grant record with its funder, related project, requested amount, status and key dates. Use the workspace to keep grant context visible alongside delivery rather than in a separate spreadsheet."
      },
      {
        "id": 17,
        "question": "17. How do I create a work item?",
        "answer": "Create a work item from the relevant workspace and assign the clear owner, task context and due information. Keep it linked to the project, action or grant where that helps the team understand its purpose."
      },
      {
        "id": 18,
        "question": "18. How do I participate in an Action Working Group?",
        "answer": "Open the action’s collaboration area and review the participants and their RACI-style roles. Add or update permitted internal context with the appropriate delivery team, not external partner accounts."
      },
      {
        "id": 19,
        "question": "19. How do I start or reply to an internal discussion?",
        "answer": "Use an action discussion thread for concise internal notes and replies about delivery rationale, blockers, evidence or handover context. All discussion stays within the authenticated council workspace."
      },
      {
        "id": 20,
        "question": "20. How do I request input from a colleague?",
        "answer": "Create an internal contribution request against the action and nominate the appropriate active council user. State whether you need an update, evidence, review, decision input or handover response."
      },
      {
        "id": 21,
        "question": "21. How do I respond to a contribution request?",
        "answer": "Open the request in My collaboration, provide the requested internal response or update the linked delivery record, then complete the request according to its current workflow."
      },
      {
        "id": 22,
        "question": "22. How do I record a partner commitment?",
        "answer": "Use the action collaboration area to record the concrete contribution required, the internal owner, due date, evidence note and current status. CivicPath records internal coordination only; it does not notify or grant access to the partner."
      },
      {
        "id": 23,
        "question": "23. How do I use a Funding collaboration room?",
        "answer": "Open or contribute to the Funding room linked to the relevant action, then record the eligibility, evidence, finance or executive-review checkpoint assigned to you. Keep checkpoints current for the next internal review."
      },
      {
        "id": 24,
        "question": "24. How do I add a checkpoint in a Funding room?",
        "answer": "Within the Funding room, add the permitted checkpoint information and clear owner/context. Use the room to organise internal readiness and review rather than relying on fragmented email threads."
      },
      {
        "id": 25,
        "question": "25. How do I add a pre-reading question to a Review Pack?",
        "answer": "Open the internal Review Pack and add a focused question that helps the meeting resolve a delivery, risk, dependency, funding or decision matter. Executives can view packs but cannot add questions."
      },
      {
        "id": 26,
        "question": "26. Can I record a Review Pack outcome?",
        "answer": "No. Organisation Administrators and Portfolio Managers record Review Pack outcomes and link them back to the live delivery record. You can provide the supporting evidence or question beforehand."
      },
      {
        "id": 27,
        "question": "27. How do I follow a record that matters to me?",
        "answer": "Create a personal watch on the relevant action, project, decision, funding position or Review Pack. Use the available notification preference; the first release provides in-app records, not automatic email digests."
      },
      {
        "id": 28,
        "question": "28. Why can’t I create a new strategy or reporting period?",
        "answer": "Strategy setup, action-register import and reporting-period management are Organisation Administrator and Portfolio Manager controls. Give the responsible manager the required information or request the change through the council’s agreed delivery process."
      },
      {
        "id": 29,
        "question": "29. Why can’t I change a project’s core setup?",
        "answer": "Project creation and core setup are controlled by Organisation Administrators and Portfolio Managers. Contributors can maintain permitted operational details such as constraints and linked delivery work."
      },
      {
        "id": 30,
        "question": "30. How do I get help when something does not work?",
        "answer": "Use Workspace settings → Send a support enquiry. Choose the closest category, describe what you were trying to do and attach an approved screenshot or document if helpful. Never include passwords, authenticator codes or payment details."
      }
    ]
  },
  "executive": {
    "label": "Executive",
    "summary": "Read-only visibility of council delivery, portfolio, funding, grant and reporting information.",
    "topHelpIds": [
      1,
      2,
      3,
      4,
      5,
      6,
      7,
      8,
      9,
      10
    ],
    "faqs": [
      {
        "id": 1,
        "question": "1. How do I get access as an Executive?",
        "answer": "An Organisation Administrator invites you with the Executive role. Open the one-time invitation, set your password and sign in. If the link is not received or has expired, ask the Organisation Administrator to resend it."
      },
      {
        "id": 2,
        "question": "2. What can I do as an Executive user?",
        "answer": "Executives have read-only visibility of the council’s delivery, portfolio, funding, grant and reporting information. The role supports oversight and informed decisions without altering live operational records."
      },
      {
        "id": 3,
        "question": "3. Why can’t I edit a project, action or report?",
        "answer": "Executive is intentionally a read-only role. Ask the relevant Organisation Administrator, Portfolio Manager or Contributor to update the live record, then review the changed information in CivicPath."
      },
      {
        "id": 4,
        "question": "4. Where do I see the overall delivery position?",
        "answer": "Open Overview for the council’s current workspace context, then use Strategy delivery, Project portfolio, Funding pathways, Grant lifecycle and Reports for the underlying detail."
      },
      {
        "id": 5,
        "question": "5. How do I view priority projects?",
        "answer": "Open Project portfolio and select the relevant project. Review its controlled readiness, pathway, stage, dates, constraints and related delivery information."
      },
      {
        "id": 6,
        "question": "6. How do I view an adopted strategy and its actions?",
        "answer": "Open Strategy delivery, select the strategy and then the focus area or action of interest. Review the recorded owner, status, next step, decision, target date, milestones, dependencies and evidence."
      },
      {
        "id": 7,
        "question": "7. What do the strategy action status labels mean?",
        "answer": "Not started means no defined commencement step is recorded; On track means current delivery aligns with the intended path; Attention required signals active management is needed; Off track means the agreed path or target is not currently being met; Complete requires recorded council evidence."
      },
      {
        "id": 8,
        "question": "8. How do I understand why an action is marked Attention required or Off track?",
        "answer": "Open the action and review the current quarterly narrative, risks/issues, dependencies, milestone variance, evidence and next decision. The colour alone is not the explanation."
      },
      {
        "id": 9,
        "question": "9. How do I view a quarterly report?",
        "answer": "Open Reports or the relevant reporting period in Strategy delivery. The report brings together recorded status, included-update coverage, attention items, focus-area context and the latest approved narrative."
      },
      {
        "id": 10,
        "question": "10. What does included in report mean?",
        "answer": "It means the update has passed the council’s configured review process and an Organisation Administrator or Portfolio Manager has formally included it in the report. It does not replace formal Council approval or statutory records."
      },
      {
        "id": 11,
        "question": "11. Can I change what is included in a quarterly report?",
        "answer": "No. Executives can review the material but cannot include or exclude updates. Raise the required change through the council’s agreed governance process with an Organisation Administrator or Portfolio Manager."
      },
      {
        "id": 12,
        "question": "12. What is an immutable report snapshot?",
        "answer": "A recorded snapshot preserves the live register and selected-quarter included updates at its generation time. Open Reports → Snapshot history to read or download the authorized entry. The stored content is immutable; later live edits do not change it. A recorded draft is not formal council approval, independent assurance or a reconstructed period-end register."
      },
      {
        "id": 13,
        "question": "13. How do I view a project’s readiness position?",
        "answer": "Open the project in Project portfolio and review its structured readiness assessment and supporting project details. Treat it as a decision-support input, not a guarantee of funding, delivery approval or future outcome."
      },
      {
        "id": 14,
        "question": "14. How do I see dependencies that need executive attention?",
        "answer": "Within Strategy delivery, open the relevant action or review the quarterly report and Review Pack. Critical dependencies, overdue milestones and decisions due for consideration are designed to be visible for focused discussion."
      },
      {
        "id": 15,
        "question": "15. How do I review a Decision Pack?",
        "answer": "Open the Decision Pack from its linked action or collaboration context. It presents the internal decision question, recommendation, options, financial implications, evidence and supporting input requests for council discussion."
      },
      {
        "id": 16,
        "question": "16. How do I review a Review Pack before a meeting?",
        "answer": "Open My collaboration or the Review Pack list, select the relevant pack and read the included current records and pre-reading questions. Review Packs are internal facilitation aids, not public reports or external share links."
      },
      {
        "id": 17,
        "question": "17. Can I add a question to a Review Pack?",
        "answer": "No. Executives are read-only. Organisation Administrators, Portfolio Managers and Contributors can add pre-reading questions; Organisation Administrators and Portfolio Managers record outcomes."
      },
      {
        "id": 18,
        "question": "18. Can I record a decision or meeting outcome myself?",
        "answer": "No. Provide the direction through the council’s normal meeting and delegation processes, then ask the authorised working role to record the decision or outcome against the relevant live delivery item."
      },
      {
        "id": 19,
        "question": "19. How do I view funding context for an action?",
        "answer": "Open the relevant action and review its funding position or Funding collaboration room context. These records help explain readiness, evidence and internal checkpoints; they do not confirm grant approval."
      },
      {
        "id": 20,
        "question": "20. How do I view the grant pipeline?",
        "answer": "Open Grant lifecycle to review recorded grant opportunities and their funder, project relationship, requested amount, status and key dates. Use the linked project or action context for the delivery rationale."
      },
      {
        "id": 21,
        "question": "21. How do I see the evidence behind a delivery claim?",
        "answer": "Open the strategy action and review its evidence links, measures and quarterly update narrative. CivicPath records council-supplied information and does not infer impact or publish claims without authorised council decisions."
      },
      {
        "id": 22,
        "question": "22. How do I follow an item that I need to revisit?",
        "answer": "Use the personal watch control on the relevant action, project, decision, funding position or Review Pack. Set the available preference and review the resulting in-app notifications in My collaboration."
      },
      {
        "id": 23,
        "question": "23. Will CivicPath email me a daily or weekly digest?",
        "answer": "Not in the current release. The platform records in-app notification preferences and does not send unapproved email digests."
      },
      {
        "id": 24,
        "question": "24. Why can’t I see other councils or the System Admin area?",
        "answer": "CivicPath isolates every council tenant, and System Admin is a separate platform-operations role. Your Executive account can only view information in your own council workspace."
      },
      {
        "id": 25,
        "question": "25. Why are some records labelled demonstration or illustrative?",
        "answer": "Demonstration records are sample data used to show how the platform works. They are not customer data and should not be interpreted as a council’s actual portfolio or performance position."
      },
      {
        "id": 26,
        "question": "26. How do I find the council’s subscription status?",
        "answer": "Open Workspace settings → Subscription to view the current plan, access period and status. Billing administration itself is controlled by the Organisation Administrator and the System Administrator."
      },
      {
        "id": 27,
        "question": "27. Can I change our plan, payment details or invoices?",
        "answer": "No. Billing changes are controlled through the Organisation Administrator’s secure Stripe portal functions and platform-level System Administrator controls. CivicPath does not expose payment-card details to the council workspace."
      },
      {
        "id": 28,
        "question": "28. What should I do if I think an item is inaccurate?",
        "answer": "Identify the specific live project, action, dependency, risk, decision or update and provide the factual correction to the responsible working role. They can update the appropriate live record and preserve the audit trail."
      },
      {
        "id": 29,
        "question": "29. How do I get help with access or a page that does not load?",
        "answer": "Use Workspace settings → Send a support enquiry, choose Access or account or Technical issue, and describe the page and task. You may attach an approved screenshot; do not include your password, MFA code or payment details."
      },
      {
        "id": 30,
        "question": "30. What should I not use CivicPath for?",
        "answer": "Do not use it as a substitute for formal Council resolutions, delegations, statutory records, official external partner communication or public consultation. CivicPath is an internal, tenant-scoped decision and delivery workspace that supports those established processes."
      }
    ]
  }
};

export function getRoleHelp(role) {
  return ROLE_HELP[role] || ROLE_HELP.executive;
}

export function getTopHelp(role) {
  const help = getRoleHelp(role);
  const ids = new Set(help.topHelpIds || []);
  return help.faqs.filter((item) => ids.has(item.id));
}

const SEARCH_ALIASES = {
  colleague: ['staff', 'user', 'member', 'person'],
  staff: ['colleague', 'user', 'member', 'person'],
  invite: ['invitation', 'resend'],
  import: ['csv', 'register', 'template'],
  spreadsheet: ['csv', 'register', 'template'],
  billing: ['subscription', 'payment', 'invoice', 'stripe'],
  payment: ['billing', 'subscription', 'invoice', 'stripe'],
  invoice: ['billing', 'payment', 'subscription', 'stripe'],
  mfa: ['authenticator', 'recovery', 'two factor'],
  factor: ['mfa', 'authenticator'],
  code: ['mfa', 'authenticator', 'recovery'],
  meeting: ['review pack', 'decision pack'],
  pack: ['review pack', 'decision pack'],
  update: ['progress', 'quarterly', 'contribution'],
  evidence: ['source', 'measure', 'document'],
  error: ['issue', 'support', 'does not work'],
};

export function normalizeHelpQuery(query) {
  return String(query || '').toLowerCase().replace(/[^a-z0-9]+/g, ' ').trim();
}

export function searchRoleHelp(role, query) {
  const help = getRoleHelp(role);
  const normalizedQuery = normalizeHelpQuery(query);
  const terms = normalizedQuery.split(/\s+/).filter((term) => term.length >= 3);
  if (!terms.length) return help.faqs;
  const minimumDirectMatches = terms.length >= 3 ? Math.min(3, Math.ceil(terms.length / 2)) : 1;

  return help.faqs.map((item, index) => {
    const question = normalizeHelpQuery(questionLabel(item.question));
    const answer = normalizeHelpQuery(item.answer);
    const combined = `${question} ${answer}`;
    const exactPhrase = question.includes(normalizedQuery) || combined.includes(normalizedQuery);
    let score = 0;
    let directMatches = 0;

    if (question.includes(normalizedQuery)) score += 120;
    else if (combined.includes(normalizedQuery)) score += 80;

    terms.forEach((term) => {
      if (question.includes(term)) {
        score += 24;
        directMatches += 1;
      } else if (answer.includes(term)) {
        score += 12;
        directMatches += 1;
      }

      (SEARCH_ALIASES[term] || []).forEach((alias) => {
        const normalizedAlias = normalizeHelpQuery(alias);
        if (question.includes(normalizedAlias)) score += 6;
        else if (answer.includes(normalizedAlias)) score += 3;
      });
    });

    return { item, index, score, directMatches, exactPhrase };
  }).filter(({ score, directMatches, exactPhrase }) => score > 0 && (exactPhrase || directMatches >= minimumDirectMatches))
    .sort((left, right) => right.score - left.score || left.index - right.index)
    .map(({ item }) => item);
}

export function questionLabel(question) {
  return String(question || '').replace(/^\d+\.\s*/, '');
}
