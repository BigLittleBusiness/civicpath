import React from 'react';
import { RecordMaintenanceWorkspace } from './RecordMaintenanceWorkspace';

const PROJECT_GROUPS = [
  { kind: 'work-items', filter: 'projectId', label: 'Project work items, risks and decisions' },
  { kind: 'evidence', filter: 'projectId', label: 'Project evidence' },
];
// team/canManage are accepted for parent integration, but permissions and reference
// options are always obtained from the authenticated maintenance API, not these props.
export function ProjectMaintenancePanel({ project, onChanged, enabled = false }) {
  return <RecordMaintenanceWorkspace rootKind="projects" recordId={project?.id} groups={PROJECT_GROUPS} heading="Project record maintenance" onChanged={onChanged} enabled={enabled}/>;
}
export default ProjectMaintenancePanel;
