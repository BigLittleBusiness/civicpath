export const portfolioProjects = [
  { id: 'p1', name: 'Regional workforce housing pathway', priority: 'Capable & connected community', stage: 'Business case', readiness: 72, cost: 2800000, target: 1900000, secured: 0, jobs: 18, owner: 'Jordan Reid', due: '30 Jun 2027', risk: 'High' },
  { id: 'p2', name: 'Livestock & freight services precinct', priority: 'Resilient regional economy', stage: 'Funding ready', readiness: 84, cost: 1600000, target: 1200000, secured: 0, jobs: 12, owner: 'Jordan Reid', due: '31 Dec 2027', risk: 'Medium' },
  { id: 'p3', name: 'Water-smart agribusiness capability program', priority: 'Resilient regional economy', stage: 'Scoping', readiness: 56, cost: 480000, target: 350000, secured: 0, jobs: 9, owner: 'Alex Morgan', due: '31 Mar 2027', risk: 'Medium' },
  { id: 'p4', name: 'Early learning workforce participation hub', priority: 'Capable & connected community', stage: 'Delivery', readiness: 91, cost: 5600000, target: 4200000, secured: 4200000, jobs: 24, owner: 'Jordan Reid', due: '31 Oct 2027', risk: 'Low' },
  { id: 'p5', name: 'Renewable energy workforce transition program', priority: 'Infrastructure ready for growth', stage: 'Concept', readiness: 38, cost: 750000, target: 500000, secured: 0, jobs: 22, owner: 'Alex Morgan', due: '30 Jun 2028', risk: 'High' },
];

export const grants = [
  { id: 'g1', name: 'Livestock precinct enabling works', funder: 'Regional Infrastructure Fund', amount: 1200000, status: 'Preparing', due: '28 Feb 2027', project: 'Livestock & freight services precinct', progress: 58 },
  { id: 'g2', name: 'Perrin Park early learning centre', funder: 'Sustainable Communities Program', amount: 4200000, status: 'Contracted', due: '31 Oct 2026', project: 'Early learning workforce participation hub', progress: 76 },
  { id: 'g3', name: 'Regional workforce housing feasibility', funder: 'Regional Development Trust', amount: 180000, status: 'Assessing', due: '15 Nov 2026', project: 'Regional workforce housing pathway', progress: 25 },
];

export const actions = [
  { id: 1, title: 'Complete housing demand and delivery options brief', type: 'Action', priority: 'Critical', project: 'Regional workforce housing pathway', owner: 'Jordan Reid', due: '25 Sep', status: 'In progress' },
  { id: 2, title: 'Confirm operator and site-servicing assumptions', type: 'Decision', priority: 'High', project: 'Livestock & freight services precinct', owner: 'Executive team', due: '02 Oct', status: 'Blocked' },
  { id: 3, title: 'Prepare first claims evidence pack', type: 'Grant task', priority: 'High', project: 'Early learning workforce participation hub', owner: 'Jordan Reid', due: '31 Oct', status: 'In progress' },
  { id: 4, title: 'Record preferred local procurement outcomes', type: 'Risk', priority: 'Medium', project: 'Renewable energy workforce transition program', owner: 'Alex Morgan', due: '07 Nov', status: 'Not started' },
];

export const stageData = [
  { stage: 'Concept', count: 1, colour: '#a7b5b0' }, { stage: 'Scoping', count: 1, colour: '#dfab7a' }, { stage: 'Business case', count: 1, colour: '#bb7650' }, { stage: 'Funding ready', count: 1, colour: '#178568' }, { stage: 'Delivery', count: 1, colour: '#234c55' },
];
export const readinessData = [{ name: 'Ready', value: 2, color: '#178568' }, { name: 'In development', value: 2, color: '#dfab7a' }, { name: 'Early stage', value: 1, color: '#b9c5c1' }];
export const fundingVelocity = [{ month: 'Jul', value: 0.4, awarded: 0 }, { month: 'Aug', value: 0.7, awarded: 0.2 }, { month: 'Sep', value: 1.1, awarded: 0.4 }, { month: 'Oct', value: 1.9, awarded: 0.8 }, { month: 'Nov', value: 2.6, awarded: 1.2 }, { month: 'Dec', value: 3.5, awarded: 1.8 }];
export const readinessProfile = [{ metric: 'Scope', score: 78 }, { metric: 'Cost', score: 65 }, { metric: 'Approvals', score: 54 }, { metric: 'Partners', score: 82 }, { metric: 'Funding', score: 61 }, { metric: 'Delivery', score: 73 }];
export const benefitData = [{ name: 'Jobs', value: 85 }, { name: 'Funding sought', value: 8.15 }, { name: 'Funding secured', value: 4.2 }];

