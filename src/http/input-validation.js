'use strict';

function createStrictObjectValidator(rules) {
  if (!rules || typeof rules !== 'object' || Array.isArray(rules)) {
    throw new TypeError('Validation rules must be an object');
  }

  const keys = Object.keys(rules);

  for (const key of keys) {
    const rule = rules[key];
    const validator = typeof rule === 'function' ? rule : rule?.validate;
    if (typeof validator !== 'function') {
      throw new TypeError(`Validator for ${key} must be a function`);
    }
  }

  return input => {
    if (!input || typeof input !== 'object' || Array.isArray(input)) {
      throw new TypeError('Input must be an object');
    }

    for (const key of Object.keys(input)) {
      if (!Object.prototype.hasOwnProperty.call(rules, key)) {
        throw new TypeError(`Unexpected field: ${key}`);
      }
    }

    for (const key of keys) {
      const rule = rules[key];
      const validator = typeof rule === 'function' ? rule : rule.validate;
      const required = typeof rule === 'function' || rule.required === true;
      if (!Object.prototype.hasOwnProperty.call(input, key)) {
        if (required) throw new TypeError(`Invalid field: ${key}`);
        continue;
      }
      if (!validator(input[key])) throw new TypeError(`Invalid field: ${key}`);
    }

    return input;
  };
}

function createValidationMiddleware(validator, source = 'body') {
  if (typeof validator !== 'function') {
    throw new TypeError('Validation middleware requires a validator');
  }
  if (!['body', 'params', 'query'].includes(source)) {
    throw new TypeError('Validation source must be body, params, or query');
  }

  return (req, res, next) => {
    try {
      req[source] = validator(req[source]);
      next();
    } catch (error) {
      res.status(400).json({ ok: false, error: error.message });
    }
  };
}

module.exports = {
  createStrictObjectValidator,
  createValidationMiddleware,
};
