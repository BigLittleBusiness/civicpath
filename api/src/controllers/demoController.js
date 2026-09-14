import { Organization, CivicProject, Grant, FundingPathway, WorkItem, EvidenceItem, ReadinessAssessment, Priority } from '../models/index.js';

export async function resetDemo(req, res, next) {
  try {
    const organisation = await Organization.findOne({ where: { id: req.tenant.organizationId, isDemo: true } });
    if (!organisation) return res.status(403).json({ error: 'The demonstration reset is available only in the CivicPath demonstration workspace.' });
    await Promise.all([
      EvidenceItem.destroy({ where: req.tenant, force: true }), WorkItem.destroy({ where: req.tenant, force: true }), Grant.destroy({ where: req.tenant, force: true }), FundingPathway.destroy({ where: req.tenant, force: true }), ReadinessAssessment.destroy({ where: req.tenant, force: true }), CivicProject.destroy({ where: req.tenant, force: true }), Priority.destroy({ where: req.tenant, force: true }),
    ]);
    return res.status(202).json({ data: { resetRequested: true, message: 'The demonstration workspace has been cleared. Run the controlled seed command to restore demonstration records.' } });
  } catch (error) { return next(error); }
}

