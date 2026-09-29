import { Organization, CivicProject, Grant, FundingPathway, WorkItem, EvidenceItem, ReadinessAssessment, Priority, StrategicPlan, StrategyFocusArea, StrategyStatusDefinition, StrategyAction, StrategyActionProject, ActionMilestone, ActionDependency, QuarterlyReportingPeriod, QuarterlyActionUpdate, StrategyMeasure, StrategyDecision, StrategyStakeholder, StrategyRiskIssue, ActionFundingPosition, ActionEvidenceLink, StrategyReportSnapshot, StrategyAlert } from '../models/index.js';

export async function resetDemo(req, res, next) {
  try {
    const organisation = await Organization.findOne({ where: { id: req.tenant.organizationId, isDemo: true } });
    if (!organisation) return res.status(403).json({ error: 'The demonstration reset is available only in the CivicPath demonstration workspace.' });
    // Remove delivery-workspace children before their referenced strategy, project and priority records.
    await Promise.all([
      StrategyAlert.destroy({ where: req.tenant, force: true }),
      StrategyReportSnapshot.destroy({ where: req.tenant, force: true }),
      QuarterlyActionUpdate.destroy({ where: req.tenant, force: true }),
      ActionDependency.destroy({ where: req.tenant, force: true }),
      ActionMilestone.destroy({ where: req.tenant, force: true }),
      StrategyActionProject.destroy({ where: req.tenant, force: true }),
      StrategyMeasure.destroy({ where: req.tenant, force: true }),
      StrategyDecision.destroy({ where: req.tenant, force: true }),
      StrategyStakeholder.destroy({ where: req.tenant, force: true }),
      StrategyRiskIssue.destroy({ where: req.tenant, force: true }),
      ActionFundingPosition.destroy({ where: req.tenant, force: true }),
      ActionEvidenceLink.destroy({ where: req.tenant, force: true }),
    ]);
    await Promise.all([
      QuarterlyReportingPeriod.destroy({ where: req.tenant, force: true }),
      StrategyAction.destroy({ where: req.tenant, force: true }),
      StrategyFocusArea.destroy({ where: req.tenant, force: true }),
      StrategyStatusDefinition.destroy({ where: req.tenant, force: true }),
      StrategicPlan.destroy({ where: req.tenant, force: true }),
      EvidenceItem.destroy({ where: req.tenant, force: true }),
      WorkItem.destroy({ where: req.tenant, force: true }),
      Grant.destroy({ where: req.tenant, force: true }),
      FundingPathway.destroy({ where: req.tenant, force: true }),
      ReadinessAssessment.destroy({ where: req.tenant, force: true }),
    ]);
    await Promise.all([
      CivicProject.destroy({ where: req.tenant, force: true }),
      Priority.destroy({ where: req.tenant, force: true }),
    ]);
    return res.status(202).json({ data: { resetRequested: true, message: 'The demonstration workspace has been cleared. Run the controlled seed command to restore demonstration records.' } });
  } catch (error) { return next(error); }
}
