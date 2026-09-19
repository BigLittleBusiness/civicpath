const SCORE_VERSION = '1.0.0';

const pointMaps = {
  portfolioVisibilityLocation: {
    single_shared_view: 4,
    linked_team_views: 3,
    separate_spreadsheets: 2,
    individual_records: 1,
    email_meetings: 0,
    not_sure: 0,
  },
  portfolioInformationConsistency: {
    all_or_almost_all: 4,
    most: 3,
    some: 2,
    few: 1,
    not_consistent: 0,
    not_sure: 0,
  },
  strategicConnection: {
    clear_and_recorded: 4,
    clear_but_not_consistent: 3,
    clear_for_some: 2,
    usually_implicit: 1,
    not_clear: 0,
    not_sure: 0,
  },
  decisionComparison: {
    easy_consistent_comparison: 4,
    possible_with_prep: 3,
    possible_for_some: 2,
    case_by_case: 1,
    difficult_to_compare: 0,
    not_sure: 0,
  },
  readinessOwnerNextAction: {
    almost_all: 4,
    more_than_half: 3,
    about_half: 2,
    a_few: 1,
    none_or_unknown: 0,
  },
  evidenceVisibility: {
    visible_and_reviewed: 4,
    visible_not_regularly: 3,
    visible_for_some: 2,
    mostly_known_informally: 1,
    not_visible: 0,
    not_sure: 0,
  },
  constraintActioning: {
    owner_action_due_date: 4,
    owner_or_action: 3,
    recorded_but_not_managed: 2,
    discussed_informally: 1,
    not_consistently_captured: 0,
    not_sure: 0,
  },
};

const dimensionDefinitions = {
  portfolioVisibility: {
    label: 'Portfolio visibility',
    weight: 0.30,
    action: {
      title: 'Create a shared portfolio baseline',
      text: 'Bring the next 5–15 initiatives into one current view with a consistent outcome, owner, stage, next action and constraint for each.',
    },
  },
  strategicConnection: {
    label: 'Strategic connection',
    weight: 0.35,
    action: {
      title: 'Make the decision link visible',
      text: 'Map each priority initiative to the council outcome, planning commitment or decision it is intended to support.',
    },
  },
  decisionReadiness: {
    label: 'Decision readiness',
    weight: 0.35,
    action: {
      title: 'Clarify the next move',
      text: 'For each priority initiative, record one accountable owner, one clear next action and the material constraint that could stop progress.',
    },
  },
};

const constraintActions = {
  evidence_data: {
    title: 'Make evidence needs explicit',
    text: 'Identify the one baseline, benefit, demand or impact evidence gap that needs to be addressed before the next decision.',
  },
  scope_business_case: {
    title: 'Frame the delivery choice',
    text: 'Record the current scope, key option or business-case question that needs to be resolved for each material initiative.',
  },
  cost_estimate: {
    title: 'Surface cost and contribution',
    text: 'Add the best current indicative cost, likely co-contribution and affordability question to the shared view.',
  },
  funding_pathway: {
    title: 'Link work to a funding pathway',
    text: 'For each relevant initiative, capture the next realistic funding, advocacy or investment pathway and its timing.',
  },
  approvals_governance: {
    title: 'Identify the approval path',
    text: 'Make the next policy, governance or approval decision visible, along with who needs to prepare it.',
  },
  resourcing_capacity: {
    title: 'Test delivery capacity',
    text: 'Identify the internal capability or resourcing dependency that needs an owner before the initiative can progress.',
  },
  partner_alignment: {
    title: 'Make partnership work visible',
    text: 'Record the partner, community or agency alignment step that would reduce uncertainty or unblock progress.',
  },
  land_planning: {
    title: 'Clarify site and planning dependencies',
    text: 'Surface the key land, planning or statutory dependency early and give it an accountable next action.',
  },
  other: {
    title: 'Capture the material blocker',
    text: 'Add the material blocker to the shared view, agree who will move it next and set a review point.',
  },
};

const constraintPriority = ['evidence_data', 'scope_business_case', 'cost_estimate', 'funding_pathway', 'approvals_governance', 'resourcing_capacity', 'partner_alignment', 'land_planning', 'other'];
const dimensionTieOrder = ['decisionReadiness', 'portfolioVisibility', 'strategicConnection'];

function normalise(points) {
  return Math.round((points / 4) * 100);
}

function labelForScore(score) {
  if (score < 50) return 'Baseline to establish';
  if (score < 75) return 'Working view to connect';
  return 'Shared view in place';
}

function strategicLabelForScore(score) {
  if (score < 50) return 'Link to make visible';
  if (score < 75) return 'Alignment to strengthen';
  return 'Alignment visible';
}

function readinessLabelForScore(score) {
  if (score < 50) return 'Next actions to clarify';
  if (score < 75) return 'Decision evidence to strengthen';
  return 'Decision pathway visible';
}

function bandForScore(score) {
  if (score < 40) return { code: 'baseline_needed', label: 'Establish a shared baseline' };
  if (score < 60) return { code: 'connections_to_build', label: 'Connect the working view' };
  if (score < 80) return { code: 'decision_confidence_to_strengthen', label: 'Strengthen decision confidence' };
  return { code: 'consistency_to_scale', label: 'Scale consistent practice' };
}

function orderedDimensions(scores) {
  return Object.entries(scores)
    .map(([key, score]) => ({ key, score, tie: dimensionTieOrder.indexOf(key) }))
    .sort((a, b) => (a.score - b.score) || (a.tie - b.tie));
}

function selectedConstraintAction(constraintThemes = []) {
  const selected = constraintPriority.find((code) => constraintThemes.includes(code));
  return constraintActions[selected || 'other'];
}

export function calculatePulseResult(responses) {
  const portfolioVisibility = Math.round((normalise(pointMaps.portfolioVisibilityLocation[responses.portfolioVisibilityLocation]) * 0.40)
    + (normalise(pointMaps.portfolioInformationConsistency[responses.portfolioInformationConsistency]) * 0.60));
  const strategicConnection = Math.round((normalise(pointMaps.strategicConnection[responses.strategicConnection]) * 0.60)
    + (normalise(pointMaps.decisionComparison[responses.decisionComparison]) * 0.40));
  const decisionReadiness = Math.round((normalise(pointMaps.readinessOwnerNextAction[responses.readinessOwnerNextAction]) * 0.45)
    + (normalise(pointMaps.evidenceVisibility[responses.evidenceVisibility]) * 0.30)
    + (normalise(pointMaps.constraintActioning[responses.constraintActioning]) * 0.25));
  const overallScore = Math.round((portfolioVisibility * dimensionDefinitions.portfolioVisibility.weight)
    + (strategicConnection * dimensionDefinitions.strategicConnection.weight)
    + (decisionReadiness * dimensionDefinitions.decisionReadiness.weight));
  const band = bandForScore(overallScore);
  const dimensionScores = { portfolioVisibility, strategicConnection, decisionReadiness };
  const firstTwo = orderedDimensions(dimensionScores).slice(0, 2).map(({ key }) => ({ key, ...dimensionDefinitions[key].action }));
  const actions = [...firstTwo, { key: 'constraint_theme', ...selectedConstraintAction(responses.constraintThemes) }];
  const lowestDimension = orderedDimensions(dimensionScores)[0].key;
  const summary = `Based on your selections, the clearest first opportunity is to strengthen ${dimensionDefinitions[lowestDimension].label.toLowerCase()} across the priority initiatives you want to progress. A shared baseline for 5–15 initiatives can make the next management, planning, funding or leadership discussion more focused. This snapshot is a starting point based on the information you selected; it is not an audit or a funding assessment.`;

  return {
    scoreVersion: SCORE_VERSION,
    portfolioVisibilityScore: portfolioVisibility,
    strategicConnectionScore: strategicConnection,
    decisionReadinessScore: decisionReadiness,
    overallScore,
    bandCode: band.code,
    bandLabel: band.label,
    summary,
    actions,
    dimensions: [
      { key: 'portfolioVisibility', label: dimensionDefinitions.portfolioVisibility.label, score: portfolioVisibility, status: labelForScore(portfolioVisibility) },
      { key: 'strategicConnection', label: dimensionDefinitions.strategicConnection.label, score: strategicConnection, status: strategicLabelForScore(strategicConnection) },
      { key: 'decisionReadiness', label: dimensionDefinitions.decisionReadiness.label, score: decisionReadiness, status: readinessLabelForScore(decisionReadiness) },
    ],
  };
}

export const pulseResponseCodes = Object.freeze({
  portfolioFocus: ['economic_growth', 'housing_livable_places', 'community_facilities', 'resilience_risk', 'visitor_economy', 'enabling_infrastructure', 'environment_climate', 'workforce_skills', 'other'],
  portfolioVisibilityLocation: Object.keys(pointMaps.portfolioVisibilityLocation),
  portfolioInformationConsistency: Object.keys(pointMaps.portfolioInformationConsistency),
  strategicConnection: Object.keys(pointMaps.strategicConnection),
  decisionComparison: Object.keys(pointMaps.decisionComparison),
  readinessOwnerNextAction: Object.keys(pointMaps.readinessOwnerNextAction),
  evidenceVisibility: Object.keys(pointMaps.evidenceVisibility),
  constraintActioning: Object.keys(pointMaps.constraintActioning),
  constraintThemes: Object.keys(constraintActions),
});

export const pulseStatic = Object.freeze({ SCORE_VERSION, constraintPriority });
