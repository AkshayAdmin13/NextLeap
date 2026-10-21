'use strict';

// Lightweight per-instance rate limiting. Serverless instances are ephemeral, so this is
// a basic abuse guard, not a substitute for a shared edge rate limiter at larger scale.
const WINDOW_MS = 60_000;
const MAX_REQUESTS_PER_WINDOW = 30;
const requestBuckets = new Map();

function sendJson(res, status, payload) {
  res.statusCode = status;
  res.setHeader('Content-Type', 'application/json; charset=utf-8');
  res.setHeader('Cache-Control', 'no-store');
  res.end(JSON.stringify(payload));
}

function isValidCity(value) {
  if (typeof value !== 'string') return false;
  const city = value.trim();
  if (!city || city.length > 80) return false;
  // Allow common city names and administrative suffixes; reject control chars and URL tricks.
  return /^[\p{L}\p{M}\p{N}\s,.'’()\-]+$/u.test(city);
}

function isRateLimited(ip, now = Date.now()) {
  const bucket = requestBuckets.get(ip);
  if (!bucket || now - bucket.startedAt >= WINDOW_MS) {
    requestBuckets.set(ip, { startedAt: now, count: 1 });
    // Bound memory growth on long-lived instances.
    if (requestBuckets.size > 2_000) {
      for (const [key, value] of requestBuckets) {
        if (now - value.startedAt >= WINDOW_MS) requestBuckets.delete(key);
      }
    }
    return false;
  }
  bucket.count += 1;
  return bucket.count > MAX_REQUESTS_PER_WINDOW;
}

module.exports = async function handler(req, res) {
  res.setHeader('Cache-Control', 'no-store');
  res.setHeader('X-Content-Type-Options', 'nosniff');

  if (req.method !== 'GET') {
    res.setHeader('Allow', 'GET');
    return sendJson(res, 405, { error: { code: 'METHOD_NOT_ALLOWED', message: 'Use GET to request weather.' } });
  }

  const rawIp = req.headers['x-forwarded-for'];
  const ip = (typeof rawIp === 'string' ? rawIp.split(',')[0] : 'unknown').trim().slice(0, 80) || 'unknown';
  if (isRateLimited(ip)) {
    res.setHeader('Retry-After', '60');
    return sendJson(res, 429, { error: { code: 'RATE_LIMITED', message: 'Too many requests. Please wait a moment and try again.' } });
  }

  const city = typeof req.query?.city === 'string' ? req.query.city.trim() : '';
  if (!isValidCity(city)) {
    return sendJson(res, 400, { error: { code: 'INVALID_CITY', message: 'Enter a city name up to 80 characters using letters, numbers, spaces, commas, apostrophes, dots, parentheses, or hyphens.' } });
  }

  const apiKey = process.env.WEATHERAPI_KEY;
  if (!apiKey) {
    return sendJson(res, 503, { error: { code: 'WEATHER_KEY_NOT_CONFIGURED', message: 'Weather service is not configured yet. Add WEATHERAPI_KEY in the deployment environment.' } });
  }

  const url = new URL('https://api.weatherapi.com/v1/current.json');
  url.searchParams.set('key', apiKey);
  url.searchParams.set('q', city);
  url.searchParams.set('aqi', 'no');

  try {
    const upstream = await fetch(url, { method: 'GET', signal: AbortSignal.timeout(8_000) });
    let body = await upstream.text();
    // Defensive guard: never echo the configured credential even if an upstream error did so.
    if (body.includes(apiKey)) body = body.split(apiKey).join('[redacted]');
    res.statusCode = upstream.status;
    res.setHeader('Content-Type', upstream.headers.get('content-type') || 'application/json; charset=utf-8');
    res.setHeader('Cache-Control', 'no-store');
    return res.end(body);
  } catch (error) {
    const timedOut = error?.name === 'TimeoutError' || error?.name === 'AbortError';
    return sendJson(res, timedOut ? 504 : 502, {
      error: {
        code: timedOut ? 'UPSTREAM_TIMEOUT' : 'UPSTREAM_UNAVAILABLE',
        message: timedOut ? 'The weather service took too long to respond. Please retry.' : 'Could not reach the weather service. Check your connection and retry.'
      }
    });
  }
};

// Exported for small deterministic tests; Vercel still invokes the handler above.
module.exports._test = { isValidCity, isRateLimited };
