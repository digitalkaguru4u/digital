const config = require('../config');

function notFoundApi(req, res) {
  res.status(404).json({ error: `Not found: ${req.method} ${req.originalUrl}` });
}

// eslint-disable-next-line no-unused-vars
function errorHandler(err, req, res, _next) {
  let status = err.status || err.statusCode || 500;
  let message = err.message || 'Something went wrong';

  if (err.name === 'CastError') { status = 400; message = 'Invalid id'; }
  if (err.name === 'ValidationError') { status = 422; message = Object.values(err.errors)[0]?.message || 'Invalid data'; }
  if (err.code === 11000) { status = 409; message = `Duplicate value for ${Object.keys(err.keyValue || {}).join(', ') || 'a unique field'}`; }
  if (err.type === 'entity.too.large') { status = 413; message = 'Request too large'; }
  if (err.type === 'entity.parse.failed') { status = 400; message = 'Malformed JSON'; }

  if (status >= 500) {
    console.error('[error]', req.method, req.originalUrl, err);
    if (config.isProd) message = 'Internal server error';
  }
  res.status(status).json({ error: message, ...(err.details ? { details: err.details } : {}) });
}

module.exports = { notFoundApi, errorHandler };
