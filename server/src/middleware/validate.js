const { AppError } = require('../utils/errors');

/** Validate & strip unknown keys from body/query/params with Zod (mass-assignment + injection defense). */
const validate = (schemas) => (req, _res, next) => {
  try {
    for (const key of ['body', 'query', 'params']) {
      if (schemas[key]) {
        const result = schemas[key].safeParse(req[key]);
        if (!result.success) {
          const err = new AppError(400, 'Validation failed', 'VALIDATION');
          err.details = result.error.flatten();
          throw err;
        }
        if (key === 'query') req.validatedQuery = result.data;
        else req[key] = result.data;
      }
    }
    next();
  } catch (e) {
    next(e);
  }
};

module.exports = validate;
