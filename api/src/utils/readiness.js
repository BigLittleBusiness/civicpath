export function calculateReadinessScore(scores) {
  const dimensions = ['scopeScore', 'costScore', 'approvalsScore', 'partnerScore', 'fundingScore', 'deliveryScore'];
  const total = dimensions.reduce((sum, key) => sum + Number(scores[key] || 0), 0);
  return Math.round((total / (dimensions.length * 5)) * 100);
}

export function readinessBand(score) {
  if (score >= 75) return 'funding_ready';
  if (score >= 50) return 'in_development';
  return 'early_stage';
}

