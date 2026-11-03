import { Op, literal } from 'sequelize';
import { sequelize } from '../config/database.js';
import { Grant, FundingPathway, Organization, User, CivicProject, EvidenceItem, WorkItem, AuditLog } from '../models/index.js';
import { FundingLifecycleRecord } from '../models/fundingLifecycle.js';
import { recordAudit } from '../services/audit.js';
import { createFundingLifecycleHandlers } from '../services/fundingLifecycle.js';

export const fundingLifecycleHandlers = createFundingLifecycleHandlers({
  sequelize, Op, literal, audit: recordAudit,
  models: { Grant, FundingPathway, Organization, User, CivicProject, EvidenceItem, WorkItem, AuditLog, FundingLifecycleRecord },
});
export const {
  listPathways, getPathway, createPathway, updatePathway, archivePathway, reactivatePathway, exportPathways,
  listGrants, getGrant, createGrant, updateGrant, archiveGrant, reactivateGrant, exportGrants,
  options: fundingReferenceOptions, grantHistory,
} = fundingLifecycleHandlers;
