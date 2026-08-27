'use strict';

const crypto = require('crypto');

function safeSecretEquals(expected, received) {
  if (typeof expected !== 'string' || expected.length === 0 || typeof received !== 'string' || received.length === 0) return false;
  const expectedBuffer = Buffer.from(expected);
  const receivedBuffer = Buffer.from(received);
  if (expectedBuffer.length !== receivedBuffer.length) return false;
  return crypto.timingSafeEqual(expectedBuffer, receivedBuffer);
}

function getProviderSecret(req, queryName = 'token', headerName = 'x-provider-token') {
  const headerValue = req.get(headerName);
  if (typeof headerValue === 'string' && headerValue.trim() !== '') return headerValue.trim();
  const queryValue = req.query?.[queryName];
  return typeof queryValue === 'string' && queryValue.trim() !== '' ? queryValue.trim() : null;
}

function assertProviderSecret(req, expectedSecret, options = {}) {
  const { queryName = 'token', headerName = 'x-provider-token' } = options;
  const received = getProviderSecret(req, queryName, headerName);
  if (!safeSecretEquals(expectedSecret, received)) {
    const error = new Error('Unauthorized');
    error.statusCode = 401;
    throw error;
  }
}

module.exports = { safeSecretEquals, getProviderSecret, assertProviderSecret };
