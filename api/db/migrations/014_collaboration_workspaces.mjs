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
  PlatformSetting,
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
  // Existing recorded updates were already part of established reporting. The
  // migration runner intentionally reruns each migration, so persist a durable,
  // auditable cutover marker. New drafts created after the first collaboration
  // deployment must remain drafts until an authorised manager includes them.
  await sequelize.transaction(async (transaction) => {
    const [cutover, created] = await PlatformSetting.findOrCreate({
      where: { settingKey: 'collaboration_014_quarterly_workflow_cutover' },
      defaults: { configuration: { version: 1, status: 'started' } },
      transaction,
    });
    if (!created) return;
    const [legacyUpdatesIncluded] = await QuarterlyActionUpdate.update(
      {
        workflowStatus: 'included_in_report',
        includedInReportAt: sequelize.fn('COALESCE', sequelize.col('submitted_at'), sequelize.col('created_at')),
      },
      { where: { workflowStatus: 'draft' }, transaction },
    );
    await cutover.update({
      configuration: { version: 1, status: 'complete', legacyUpdatesIncluded, completedAt: new Date().toISOString() },
    }, { transaction });
  });
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
