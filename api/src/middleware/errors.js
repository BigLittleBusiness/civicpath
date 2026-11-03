const safeErrorCodes = new Set(['ER_LOCK_DEADLOCK', 'ER_LOCK_WAIT_TIMEOUT', 'ECONNREFUSED', 'ETIMEDOUT', 'LIMIT_FILE_SIZE', 'LIMIT_FILE_COUNT', 'LIMIT_UNEXPECTED_FILE']);
const safeErrorNames = new Set(['SelectorValidationError', 'BillingConfigurationError', 'PeopleAccessValidationError', 'SupportAttachmentError', 'MulterError', 'SequelizeValidationError', 'SequelizeUniqueConstraintError', 'SequelizeDatabaseError', 'SequelizeConnectionError']);

export function notFound(_req, res) {
  return res.status(404).json({ error: 'The requested CivicPath resource was not found.' });
}

export function errorHandler(error, _req, res, _next) {
  // Never log the exception object: driver errors can carry SQL, values, credentials,
  // connection settings, user narrative or signed URLs. Operational counters only.
  console.error({ event: 'api_request_failed', category: safeErrorNames.has(error?.name) ? error.name : 'unexpected', code: safeErrorCodes.has(error?.code) ? error.code : 'unclassified' });
  if (error.name === 'SelectorValidationError') return res.status(422).json({ error: error.message });
  if (error.name === 'BillingConfigurationError') return res.status(422).json({ error: error.message });
  if (error.name === 'PeopleAccessValidationError') return res.status(error.status || 422).json({ error: error.message });
  if (error.type === 'StripeInvalidRequestError') return res.status(422).json({ error: 'Stripe could not complete that billing action. Review the customer, plan and invoice details, then try again.' });
  if (error.name === 'SupportAttachmentError') return res.status(error.status || 422).json({ error: error.message });
  if (error.name === 'MulterError') {
    const message = error.code === 'LIMIT_FILE_SIZE' ? 'Attachments must be 10 MB or smaller.' : error.code === 'LIMIT_FILE_COUNT' ? 'Attach up to three files per support enquiry.' : 'The attachment upload could not be processed.';
    return res.status(422).json({ error: message });
  }
  if (error.name === 'SequelizeValidationError' || error.name === 'SequelizeUniqueConstraintError') return res.status(422).json({ error: 'Validation failed. Check the required fields and ensure this record is not already present.' });
  return res.status(500).json({ error: 'An unexpected error occurred. Please retry or use the protected support form.' });
}
