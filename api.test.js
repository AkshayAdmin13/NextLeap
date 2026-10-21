'use strict';
const test = require('node:test');
const assert = require('node:assert/strict');
const handler = require('../api/weather');

function mockResponse() {
  return {
    headers: {}, statusCode: 200, body: '',
    setHeader(name, value) { this.headers[name.toLowerCase()] = value; },
    end(body) { this.body = body || ''; }
  };
}

function request({ method = 'GET', city = 'Pune', ip = `test-${Math.random()}` } = {}) {
  return { method, query: { city }, headers: { 'x-forwarded-for': ip } };
}

test('rejects blank city names and URL-like input', async () => {
  for (const city of ['', 'https://example.com', 'Mumbai%0a']) {
    const res = mockResponse();
    await handler(request({ city }), res);
    assert.equal(res.statusCode, 400);
    assert.equal(JSON.parse(res.body).error.code, 'INVALID_CITY');
  }
});

test('rejects non-GET methods', async () => {
  const res = mockResponse();
  await handler(request({ method: 'POST' }), res);
  assert.equal(res.statusCode, 405);
  assert.equal(res.headers.allow, 'GET');
});

test('returns clear configuration error when WEATHERAPI_KEY is missing', async () => {
  const before = process.env.WEATHERAPI_KEY;
  delete process.env.WEATHERAPI_KEY;
  try {
    const res = mockResponse();
    await handler(request(), res);
    assert.equal(res.statusCode, 503);
    assert.equal(JSON.parse(res.body).error.code, 'WEATHER_KEY_NOT_CONFIGURED');
  } finally {
    if (before === undefined) delete process.env.WEATHERAPI_KEY;
    else process.env.WEATHERAPI_KEY = before;
  }
});

test('proxies the raw upstream body and encodes the city without exposing the key', async () => {
  const beforeKey = process.env.WEATHERAPI_KEY;
  const beforeFetch = global.fetch;
  process.env.WEATHERAPI_KEY = 'test-secret-weather-key';
  let requestedUrl;
  global.fetch = async (url) => {
    requestedUrl = new URL(url);
    return { status: 200, headers: { get: () => 'application/json' }, text: async () => '{ "location": { "name": "New York" } }' };
  };
  try {
    const res = mockResponse();
    await handler(request({ city: 'New York' }), res);
    assert.equal(res.statusCode, 200);
    assert.equal(res.body, '{ "location": { "name": "New York" } }');
    assert.equal(requestedUrl.searchParams.get('q'), 'New York');
    assert.equal(requestedUrl.searchParams.get('key'), 'test-secret-weather-key');
    assert.equal(res.body.includes('test-secret-weather-key'), false);
    assert.equal(res.headers['cache-control'], 'no-store');
  } finally {
    global.fetch = beforeFetch;
    if (beforeKey === undefined) delete process.env.WEATHERAPI_KEY;
    else process.env.WEATHERAPI_KEY = beforeKey;
  }
});
