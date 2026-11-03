import { Op } from 'sequelize';
import { withActiveRecords, completeActiveRegister, handleIntegrationError } from '../backendRuntime.js';
import { CivicProject, FundingPathway, Grant, ReadinessAssessment, StrategicPlan, WorkItem } from '../models/index.js';

async function activeOverview(req, res, next) {
  try {
    const where = { organizationId: req.tenant.organizationId };
    const today = new Date().toISOString().slice(0, 10);
    const [projects, grants, pathways, workItems, readiness, strategyCount] = await Promise.all([
      completeActiveRegister(CivicProject, { where, attributes: ['id', 'name', 'stage', 'estimatedCost', 'targetFunding', 'securedFunding', 'expectedJobs', 'targetDate'], order: [['updatedAt', 'DESC']] }),
      Grant.findAll({ where, attributes: ['id', 'title', 'funder', 'requestedAmount', 'awardedAmount', 'status', 'dueDate', 'acquittalDueDate'], order: [['dueDate', 'ASC']], limit: 8 }),
      completeActiveRegister(FundingPathway, { where, attributes: ['id', 'sourceName', 'fit', 'potentialAmount', 'status', 'dueDate'] }),
      WorkItem.findAll({ where: { ...where, status: { [Op.not]: 'complete' }, dueDate: { [Op.lte]: today } }, attributes: ['id', 'projectId', 'title', 'workType', 'priority', 'dueDate', 'status'], order: [['dueDate', 'ASC']], limit: 10 }),
      completeActiveRegister(ReadinessAssessment, { where, attributes: ['projectId', 'score', 'assessedAt'], order: [['assessedAt', 'DESC'], ['id', 'DESC']] }),
      StrategicPlan.count({ where }),
    ]);
    const projectRows = projects.map((project) => project.get({ plain: true }));
    const grantRows = grants.map((grant) => grant.get({ plain: true }));
    const pathwayRows = pathways.map((pathway) => pathway.get({ plain: true }));
    const total = (rows, key) => rows.reduce((sum, row) => sum + Number(row[key] || 0), 0);
    const readinessByProject = {};
    for (const item of readiness) { if (!Object.hasOwn(readinessByProject, item.projectId)) readinessByProject[item.projectId] = Number(item.score); }
    const recordedScores = Object.values(readinessByProject);
    const stageMix = Object.entries(projectRows.reduce((mix, project) => ({ ...mix, [project.stage]: (mix[project.stage] || 0) + 1 }), {})).map(([stage, count]) => ({ stage, count }));
    const fundingTarget = total(projectRows, 'targetFunding');
    const securedFunding = total(projectRows, 'securedFunding');
    return res.json({ data: {
      projects: projectRows.slice(0, 8).map((project) => ({ ...project, readinessScore: readinessByProject[project.id] ?? null })),
      grants: grantRows,
      pathways: pathwayRows,
      workItems: workItems.map((item) => item.get({ plain: true })),
      summary: {
        livePortfolioValue: total(projectRows, 'estimatedCost'), fundingTarget, securedFunding,
        fundingGap: Math.max(fundingTarget - securedFunding, 0), expectedJobs: total(projectRows, 'expectedJobs'),
        averageReadiness: recordedScores.length ? Math.round((recordedScores.reduce((sum, score) => sum + score, 0) / recordedScores.length) * 10) / 10 : null, fundingReadyCount: projectRows.filter((project) => project.stage === 'funding_ready').length, strategyCount,
      },
      stageMix,
    } });
  } catch (error) { return handleIntegrationError(error, res, next); }
}

export const overview = (req, res, next) => withActiveRecords(() => activeOverview(req, res, next));
