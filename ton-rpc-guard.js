'use strict';

// Process-wide TON Center protection layer.
// It throttles every TON Center HTTP request, honors Retry-After, backs off on 429/5xx,
// and NEVER automatically retries broadcast methods because a broadcast may have been accepted.
const axios = require('axios');

const TON_HOST = /(^|\.)toncenter\.com$/i;
const MIN_INTERVAL_MS = Math.max(500, Number(process.env.TON_RPC_MIN_INTERVAL_MS || 1500));
const MAX_RETRIES = Math.max(0, Math.min(6, Number(process.env.TON_RPC_MAX_RETRIES || 5)));
const BASE_BACKOFF_MS = Math.max(1000, Number(process.env.TON_RPC_BACKOFF_MS || 15000));
const MAX_BACKOFF_MS = Math.max(BASE_BACKOFF_MS, Number(process.env.TON_RPC_MAX_BACKOFF_MS || 120000));
const API_KEY = String(process.env.TONCENTER_API_KEY || '').trim();

let queue = Promise.resolve();
let nextAllowedAt = 0;
let cooldownUntil = 0;

function sleep(ms) {
  return new Promise(resolve => setTimeout(resolve, ms));
}

function isTonCenter(config) {
  try {
    const url = new URL(config?.url || '', config?.baseURL || undefined);
    return TON_HOST.test(url.hostname);
  } catch (_) {
    return /toncenter\.com/i.test(String(config?.url || config?.baseURL || ''));
  }
}

function rpcMethod(config) {
  try {
    const raw = config?.data;
    const body = typeof raw === 'string' ? JSON.parse(raw) : raw;
    return String(body?.method || '').toLowerCase();
  } catch (_) {
    return '';
  }
}

function isBroadcastMethod(method) {
  return method === 'sendboc' || method === 'sendbocreturnhash' || method.includes('sendmessage');
}

function isRetryableReadMethod(method) {
  return !isBroadcastMethod(method);
}

function retryAfterMs(error) {
  const value = error?.response?.headers?.['retry-after'] ?? error?.response?.headers?.['Retry-After'];
  const seconds = Number(value);
  if (Number.isFinite(seconds) && seconds >= 0) return Math.min(MAX_BACKOFF_MS, seconds * 1000);
  return null;
}

function isRateLimited(error) {
  return Number(error?.response?.status || error?.status || 0) === 429 || /rate.?limit|ratelimit|too many requests/i.test(String(error?.message || ''));
}

function isTransient(error) {
  const status = Number(error?.response?.status || error?.status || 0);
  return status === 429 || status === 408 || status === 425 || status >= 500 || /ECONNRESET|ETIMEDOUT|EAI_AGAIN|socket hang up/i.test(String(error?.code || error?.message || ''));
}

async function acquireSlot() {
  const now = Date.now();
  const wait = Math.max(0, nextAllowedAt - now, cooldownUntil - now);
  if (wait > 0) await sleep(wait);
  nextAllowedAt = Date.now() + MIN_INTERVAL_MS;
}

function enqueue(task) {
  const run = queue.then(task, task);
  queue = run.catch(() => {});
  return run;
}

const originalRequest = axios.Axios.prototype.request;
if (!axios.Axios.prototype.__dzmoneyTonGuardInstalled) {
  axios.Axios.prototype.request = function guardedRequest(config) {
    if (!isTonCenter(config)) return originalRequest.call(this, config);

    const method = rpcMethod(config);
    const broadcast = isBroadcastMethod(method);
    const retryable = isRetryableReadMethod(method);

    if (API_KEY) {
      config.headers = config.headers || {};
      if (!config.headers['X-API-Key'] && !config.headers['x-api-key']) config.headers['X-API-Key'] = API_KEY;
    }

    return enqueue(async () => {
      let attempt = 0;
      while (true) {
        await acquireSlot();
        try {
          const response = await originalRequest.call(this, config);
          cooldownUntil = 0;
          return response;
        } catch (error) {
          const transient = isTransient(error);
          if (!transient || !retryable || attempt >= MAX_RETRIES) {
            if (broadcast && transient) {
              error.message = `TON broadcast outcome is unknown; automatic retry disabled for safety. ${error.message || ''}`.trim();
            }
            if (isRateLimited(error)) {
              const delay = retryAfterMs(error) ?? Math.min(MAX_BACKOFF_MS, BASE_BACKOFF_MS * (2 ** attempt));
              cooldownUntil = Date.now() + delay;
              console.error(`TON RPC guard: rate limited; cooling down for ${delay}ms (method=${method || 'unknown'})`);
            }
            throw error;
          }

          const retryDelay = retryAfterMs(error) ?? Math.min(MAX_BACKOFF_MS, BASE_BACKOFF_MS * (2 ** attempt));
          const jitter = Math.floor(Math.random() * Math.max(250, Math.floor(retryDelay * 0.2)));
          const delay = Math.min(MAX_BACKOFF_MS, retryDelay + jitter);
          cooldownUntil = Date.now() + delay;
          console.warn(`TON RPC guard: transient ${error?.response?.status || error?.code || 'error'}; retry ${attempt + 1}/${MAX_RETRIES} in ${delay}ms (method=${method || 'unknown'})`);
          attempt += 1;
          await sleep(delay);
        }
      }
    });
  };
  axios.Axios.prototype.__dzmoneyTonGuardInstalled = true;
  console.log('TON RPC guard: ENABLED', JSON.stringify({
    minIntervalMs: MIN_INTERVAL_MS,
    maxRetries: MAX_RETRIES,
    baseBackoffMs: BASE_BACKOFF_MS,
    maxBackoffMs: MAX_BACKOFF_MS,
    apiKey: API_KEY ? 'PRESENT' : 'MISSING'
  }));
}
