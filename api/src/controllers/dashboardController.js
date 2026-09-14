import { Op, fn, col } from 'sequelize';
import { CivicProject, FundingPathway, Grant, ReadinessAssessment, WorkItem } from '../models/index.js';

export async function overview(req, res, next) {
  try {
    const where = { organizationId: req.tenant.organizationId };
    const today = new Date().toISOString().slice(0, 10);
    const [projects, grants, pathways, workItems, readiness] = await Promise.all([
      CivicProject.findAll({ where, attributes: ['id', 'name', 'stage', 'estimatedCost', 'targetFunding', 'securedFunding', 'expectedJobs', 'targetDate'], order: [['updatedAt', 'DESC']], limit: 8 }),
      Grant.findAll({ where, attributes: ['id', 'title', 'funder', 'requestedAmount', 'awardedAmount', 'status', 'dueDate', 'acquittalDueDate'], order: [['dueDate', 'ASC']], limit: 8 }),
      FundingPathway.findAll({ where, attributes: ['id', 'sourceName', 'fit', 'potentialAmount', 'status', 'dueDate'] }),
      WorkItem.findAll({ where: { ...where, status: { [Op.not]: 'complete' }, dueDate: { [Op.lte]: today } }, attributes: ['id', 'projectId', 'title', 'workType', 'priority', 'dueDate', 'status'], order: [['dueDate', 'ASC']], limit: 10 }),
      ReadinessAssessment.findAll({ where, attributes: ['projectId', 'score'] }),
    ]);
    const projectRows = projects.map((project) => project.get({ plain: true }));
    const grantRows = grants.map((grant) => grant.get({ plain: true }));
    const pathwayRows = pathways.map((pathway) => pathway.get({ plain: true }));
    const total = (rows, key) => rows.reduce((sum, row) => sum + Number(row[key] || 0), 0);
    const readinessByProject = Object.fromEntries(readiness.map((item) => { const record = item.get({ plain: true }); return [record.projectId, Number(record.score)]; }));
    const stageMix = Object.entries(projectRows.reduce((mix, project) => ({ ...mix, [project.stage]: (mix[project.stage] || 0) + 1 }), {})).map(([stage, count]) => ({ stage, count }));
    const fundingTarget = total(projectRows, 'targetFunding');
    const securedFunding = total(projectRows, 'securedFunding');
    return res.json({ data: {
      projects: projectRows.map((project) => ({ ...project, readinessScore: readinessByProject[project.id] || 0 })),
      grants: grantRows,
      pathways: pathwayRows,
      workItems: workItems.map((item) => item.get({ plain: true })),
      summary: {
        livePortfolioValue: total(projectRows, 'estimatedCost'), fundingTarget, securedFunding,
        fundingGap: Math.max(fundingTarget - securedFunding, 0), expectedJobs: total(projectRows, 'expectedJobs'),
        averageReadiness: readiness.length ? Math.round((Object.values(readinessByProject).reduce((sum, score) => sum + score, 0) / readiness.length) * 10) / 10 : 0, fundingReadyCount: projectRows.filter((project) => project.stage === 'funding_ready').length,
      },
      stageMix,
    } });
  } catch (error) { return next(error); }
}
