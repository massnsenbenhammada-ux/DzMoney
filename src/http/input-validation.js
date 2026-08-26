'use strict';

function createStrictObjectValidator(rules) {
  if (!rules || typeof rules !== 'object' || Array.isArray(rules)) {
    throw new TypeError('Validation rules must be an object');
  }

  const keys = Object.keys(rules);

  for (const key of keys) {
    if (typeof rules[key] !== 'function') {
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
      if (!Object.prototype.hasOwnProperty.call(input, key) || !rules[key](input[key])) {
        throw new TypeError(`Invalid field: ${key}`);
      }
    }

    return input;
  };
}

module.exports = {
  createStrictObjectValidator,
};
