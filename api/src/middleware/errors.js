export function notFound(_req, res) {
  return res.status(404).json({ error: 'The requested CivicPath resource was not found.' });
}

export function errorHandler(error, _req, res, _next) {
  console.error(error);
  if (error.name === 'SelectorValidationError') return res.status(422).json({ error: error.message });
  if (error.name === 'SequelizeValidationError' || error.name === 'SequelizeUniqueConstraintError') {
    return res.status(422).json({ error: 'Validation failed.', details: error.errors?.map((item) => item.message) || [] });
  }
  return res.status(500).json({ error: 'An unexpected error occurred.' });
}
