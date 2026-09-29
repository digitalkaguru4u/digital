/**
 * Removes keys starting with '$' or containing '.' from body/query/params
 * to block MongoDB operator injection ({ "email": { "$gt": "" } }).
 */
function scrub(obj, depth = 0) {
  if (!obj || typeof obj !== 'object' || depth > 10) return obj;
  for (const key of Object.keys(obj)) {
    if (key.startsWith('$') || key.includes('.')) {
      delete obj[key];
    } else {
      scrub(obj[key], depth + 1);
    }
  }
  return obj;
}

module.exports = function mongoSanitize(req, _res, next) {
  scrub(req.body);
  scrub(req.params);
  if (req.query) scrub(req.query);
  next();
};
