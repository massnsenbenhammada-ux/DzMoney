'use strict';

const buckets = new Map();
const MAX_BUCKETS = 10_000;

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
    if (buckets.size > MAX_BUCKETS) pruneExpiredBuckets(now);

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

function pruneExpiredBuckets(now = Date.now()) {
  for (const [key, bucket] of buckets) {
    if (bucket.resetAt <= now) buckets.delete(key);
  }
  if (buckets.size <= MAX_BUCKETS) return;
  const excess = buckets.size - MAX_BUCKETS;
  let removed = 0;
  for (const key of buckets.keys()) {
    buckets.delete(key);
    removed += 1;
    if (removed >= excess) break;
  }
}

function clearRateLimitBuckets() {
  buckets.clear();
}

module.exports = { createRateLimit, clearRateLimitBuckets };
