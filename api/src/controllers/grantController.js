// Backwards-compatible names for the parent's existing /grants list/create imports.
// All entry points enforce live role, tenant, references and transactional audit.
export {
  listGrants, createGrant, getGrant, updateGrant, archiveGrant, reactivateGrant, exportGrants,
} from './fundingLifecycleController.js';
