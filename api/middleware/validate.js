const { HttpError } = require('../utils/http');

/** Validate req[part] against a zod schema; replaces it with the parsed value. */
const validate = (schema, part = 'body') => (req, _res, next) => {
  const result = schema.safeParse(req[part] ?? {});
  if (!result.success) {
    const details = result.error.issues.map((i) => ({ field: i.path.join('.'), message: i.message }));
    return next(new HttpError(422, details[0]?.message ? `${details[0].field || 'input'}: ${details[0].message}` : 'Invalid input', details));
  }
  if (part === 'query') req.validQuery = result.data;
  else req[part] = result.data;
  next();
};

module.exports = validate;
