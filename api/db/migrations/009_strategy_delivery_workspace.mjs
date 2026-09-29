import { sequelize } from '../../src/config/database.js';
import {
  StrategicPlan,
  StrategyFocusArea,
  StrategyStatusDefinition,
  StrategyAction,
  StrategyActionProject,
  ActionMilestone,
  ActionDependency,
  QuarterlyReportingPeriod,
  QuarterlyActionUpdate,
  StrategyMeasure,
  StrategyDecision,
  StrategyStakeholder,
  StrategyRiskIssue,
  ActionFundingPosition,
  ActionEvidenceLink,
  StrategyReportSnapshot,
  StrategyAlert,
} from '../../src/models/index.js';

const strategyModels = [
  StrategicPlan,
  StrategyFocusArea,
  StrategyStatusDefinition,
  StrategyAction,
  StrategyActionProject,
  ActionMilestone,
  ActionDependency,
  QuarterlyReportingPeriod,
  QuarterlyActionUpdate,
  StrategyMeasure,
  StrategyDecision,
  StrategyStakeholder,
  StrategyRiskIssue,
  ActionFundingPosition,
  ActionEvidenceLink,
  StrategyReportSnapshot,
  StrategyAlert,
];

try {
  await sequelize.authenticate();
  for (const model of strategyModels) await model.sync();
  console.info('CivicPath strategy delivery, dependency and quarterly-reporting schema is ready.');
} catch (error) {
  console.error('CivicPath strategy delivery migration failed:', error);
  process.exitCode = 1;
} finally {
  await sequelize.close();
}
