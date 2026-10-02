import { DataTypes } from 'sequelize';
import { sequelize } from '../../src/config/database.js';
import { BillingInvoice } from '../../src/models/index.js';
import { getStripeClient, invoiceTaxAmount } from '../../src/services/stripeBilling.js';

async function ensureColumn(table, column, definition) {
  const schema = await sequelize.getQueryInterface().describeTable(table);
  if (!schema[column]) await sequelize.getQueryInterface().addColumn(table, column, definition);
}

try {
  await sequelize.authenticate();
  const table = BillingInvoice.getTableName();
  await ensureColumn(table, 'amount_subtotal', { type: DataTypes.INTEGER.UNSIGNED, allowNull: false, defaultValue: 0 });
  await ensureColumn(table, 'amount_tax', { type: DataTypes.INTEGER.UNSIGNED, allowNull: false, defaultValue: 0 });

  // Backfill GST for invoices mirrored before these columns existed. Skipped when Stripe is not configured.
  const pending = await BillingInvoice.findAll({ where: { amountSubtotal: 0 } });
  if (pending.length) {
    try {
      const { stripe } = await getStripeClient();
      for (const invoice of pending) {
        const remote = await stripe.invoices.retrieve(invoice.stripeInvoiceId);
        await invoice.update({ amountSubtotal: Number(remote.subtotal || 0), amountTax: invoiceTaxAmount(remote) });
      }
      console.info(`Backfilled GST amounts for ${pending.length} Stripe invoice(s).`);
    } catch (error) {
      console.warn(`Invoice GST backfill skipped: ${error.message}`);
    }
  }
  console.info('CivicPath invoice subtotal and GST schema is ready.');
} catch (error) {
  console.error('CivicPath invoice tax migration failed:', error);
  process.exitCode = 1;
} finally {
  await sequelize.close();
}
