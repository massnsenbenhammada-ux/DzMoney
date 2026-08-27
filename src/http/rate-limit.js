'use strict';

const buckets = new Map();

function createRateLimit({ windowMs, max, key = request => request.telegramUser?.id ? `telegram:${request.telegramUser.id}` : request.ip || 'unknown' }) {
  if (!Number.isInteger(windowMs) || windowMs <= 0) throw new TypeError('windowMs must be a positive integer');
  if (!Number.isInteger(max) || max <= 0) throw new TypeError('max must be a positive integer');
  if (typeof key !== 'function') throw new TypeError('key must be a function');

  return (req, res, next) => {
    const now = Date.now();
    const bucketKey = key(req);
    const current = buckets.get(bucketKey);
    const bucket = !current || now >= current.resetAt
      ? { count: 0, resetAt: now + windowMs }
      : current;

    bucket.count += 1;
    buckets.set(bucketKey, bucket);
    res.setHeader('RateLimit-Limit', String(max));
    res.setHeader('RateLimit-Remaining', String(Math.max(0, max - bucket.count)));
    res.setHeader('RateLimit-Reset', String(Math.ceil((bucket.resetAt - now) / 1000)));

    if (bucket.count > max) {
      const error = new Error('Too many requests');
      error.statusCode = 429;
      error.retryAfterSeconds = Math.ceil((bucket.resetAt - now) / 1000);
      res.setHeader('Retry-After', String(error.retryAfterSeconds));
      return next(error);
    }
    return next();
  };
}

function clearRateLimitBuckets() {
  buckets.clear();
}

module.exports = { createRateLimit, clearRateLimitBuckets };
