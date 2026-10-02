import { sequelize } from '../../src/config/database.js';
import {
  ProductPlan,
  Subscription,
  User,
  BillingProfile,
  BillingInvoice,
  BillingRefund,
  BillingEvent,
  PasswordResetToken,
} from '../../src/models/index.js';

const lifecycleModels = [BillingProfile, BillingInvoice, BillingRefund, BillingEvent, PasswordResetToken];

const planSeeds = [
  {
    code: 'council-proof',
    name: 'Council Proof',
    product: 'civicpath',
    annualPriceAud: 495,
    workflowUserLimit: 3,
    activeProjectLimit: 15,
    activeGrantLimit: null,
    features: { termDays: 60, conversionCreditAud: 495, tier: 'proof' },
  },
  {
    code: 'essentials',
    name: 'CivicPath Essentials',
    product: 'civicpath',
    annualPriceAud: 2500,
    workflowUserLimit: 3,
    activeProjectLimit: 20,
    activeGrantLimit: null,
    features: { portfolios: 1, executiveReadOnly: 'unlimited', tier: 'essentials' },
  },
  {
    code: 'civicpath-core',
    name: 'CivicPath Core',
    product: 'civicpath',
    annualPriceAud: 5000,
    workflowUserLimit: 8,
    activeProjectLimit: 75,
    activeGrantLimit: null,
    features: { portfolios: 3, imports: true, reporting: true, tier: 'core' },
  },
];

try {
  await sequelize.authenticate();
  for (const model of lifecycleModels) await model.sync();

  const userColumns = await sequelize.getQueryInterface().describeTable('User');
  if (!userColumns.session_version) await sequelize.query('ALTER TABLE `User` ADD COLUMN `session_version` INT UNSIGNED NOT NULL DEFAULT 0');
  await User.sync();

  // Subscription records created by registration must be visibly pending until Stripe confirms payment.
  await sequelize.query("ALTER TABLE `Subscription` MODIFY COLUMN `status` ENUM('pending_checkout','trial','active','past_due','cancelled','expired') NOT NULL DEFAULT 'pending_checkout'");
  await Subscription.sync();

  for (const seed of planSeeds) {
    const [plan] = await ProductPlan.findOrCreate({ where: { code: seed.code }, defaults: seed });
    if (plan.isActive !== true || plan.name !== seed.name || Number(plan.annualPriceAud) !== seed.annualPriceAud) {
      await plan.update({ ...seed, isActive: true });
    }
  }

  console.info('CivicPath Stripe account, billing, invoice, refund and password-reset lifecycle schema is ready.');
} catch (error) {
  console.error('CivicPath Stripe account and billing migration failed:', error);
  process.exitCode = 1;
} finally {
  await sequelize.close();
}
