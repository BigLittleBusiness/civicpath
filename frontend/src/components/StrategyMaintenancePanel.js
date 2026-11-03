import React from 'react';
import { RecordMaintenanceWorkspace } from './RecordMaintenanceWorkspace';

const ACTION_GROUPS = [
  { kind: 'milestones', filter: 'actionId', label: 'Milestones' },
  { kind: 'measures', filter: 'actionId', label: 'Measures' },
  { kind: 'action-evidence', filter: 'actionId', label: 'Action evidence' },
  { kind: 'funding', filter: 'actionId', label: 'Funding positions' },
  { kind: 'stakeholders', filter: 'actionId', label: 'Stakeholders' },
  { kind: 'risks', filter: 'actionId', label: 'Risks and issues' },
  { kind: 'decisions', filter: 'actionId', label: 'Decisions' },
];
// team/canManage are intentionally not trusted for authorization or owner selection.
// Enable only after guarded compatibility handlers precede legacy PATCH routes.
export function StrategyMaintenancePanel({ action, onChanged, enabled = false, compatibilityEndpoints = true }) {
  return <RecordMaintenanceWorkspace rootKind="actions" recordId={action?.id} groups={ACTION_GROUPS} heading="Strategy action maintenance" onChanged={onChanged} enabled={enabled} compatibilityEndpoints={compatibilityEndpoints}/>;
}
export default StrategyMaintenancePanel;
