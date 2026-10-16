import { sequelize } from '../../src/config/database.js';
import {
  ActionDependency,
  CollaborationActivity,
  CollaborationComment,
  CollaborationNotification,
  CollaborationParticipant,
  CollaborationRequest,
  CollaborationThread,
  DecisionPack,
  EngagementPlan,
  FundingCollaborationRoom,
  FundingRoomCheckpoint,
  PartnerCommitment,
  QuarterlyActionUpdate,
  ReviewPack,
  ReviewPackItem,
  ReviewPackOutcome,
  ReviewPackQuestion,
  UserWatch,
} from '../../src/models/index.js';

async function addMissingColumns(model, attributes) {
  const query = sequelize.getQueryInterface();
  const table = model.getTableName();
  const columns = await query.describeTable(table);
  const definitions = model.getAttributes();
  for (const attribute of attributes) {
    const definition = definitions[attribute];
    const column = definition.field || attribute;
    if (!columns[column]) await query.addColumn(table, column, definition);
  }
}

try {
  await sequelize.authenticate();
  // Additive only: this release creates internal collaboration records and never
  // modifies, deletes or exposes existing Council tenant data.
  await addMissingColumns(ActionDependency, ['handoverRequestedBy', 'handoverRequestedTo', 'handoverStatus', 'handoverResponse', 'proposedDueDate', 'raci']);
  await addMissingColumns(QuarterlyActionUpdate, ['workflowStatus', 'reviewRequestedFromUserId', 'reviewedBy', 'reviewedAt', 'reviewComment', 'includedInReportAt']);
  // Existing recorded updates were already part of established reporting. Mark them
  // as included once so the new review workflow does not hide historical reports.
  await QuarterlyActionUpdate.update({ workflowStatus: 'included_in_report', includedInReportAt: sequelize.col('submitted_at') }, { where: { workflowStatus: 'draft' } });
  for (const model of [
    CollaborationParticipant,
    CollaborationThread,
    CollaborationComment,
    CollaborationRequest,
    CollaborationActivity,
    PartnerCommitment,
    FundingCollaborationRoom,
    FundingRoomCheckpoint,
    EngagementPlan,
    DecisionPack,
    ReviewPack,
    ReviewPackItem,
    ReviewPackQuestion,
    ReviewPackOutcome,
    UserWatch,
    CollaborationNotification,
  ]) await model.sync();
  console.info('CivicPath collaboration workspace schema is ready.');
} catch (error) {
  console.error('CivicPath collaboration workspace migration failed:', error);
  process.exitCode = 1;
} finally {
  await sequelize.close();
}
