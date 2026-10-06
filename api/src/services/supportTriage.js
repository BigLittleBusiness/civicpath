const targetHours = { urgent: 4, high: 8, normal: 24, low: 72 };

export function initialPriorityForCategory(category) {
  if (category === 'access' || category === 'billing') return 'high';
  if (category === 'technical') return 'normal';
  return 'normal';
}

export function firstResponseDueAt(priority, from = new Date()) {
  return new Date(new Date(from).getTime() + (targetHours[priority] || targetHours.normal) * 60 * 60 * 1000);
}

export function supportTargetLabel(priority) {
  const hours = targetHours[priority] || targetHours.normal;
  return hours >= 24 ? `${hours / 24} business day${hours === 24 ? '' : 's'}` : `${hours} business hours`;
}

export function supportCaseTiming(caseRecord, now = new Date()) {
  const dueAt = caseRecord.firstResponseDueAt ? new Date(caseRecord.firstResponseDueAt) : null;
  const firstRespondedAt = caseRecord.firstRespondedAt ? new Date(caseRecord.firstRespondedAt) : null;
  return {
    firstResponseDueAt: dueAt,
    firstRespondedAt,
    target: supportTargetLabel(caseRecord.priority),
    firstResponseState: firstRespondedAt ? 'responded' : !dueAt ? 'not_set' : dueAt <= now ? 'overdue' : 'pending',
  };
}
