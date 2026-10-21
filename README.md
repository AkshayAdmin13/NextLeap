# Atmos — Weather, understood.

A CRED-inspired dark weather dashboard built with HTML, CSS, vanilla JavaScript, and a Node.js Vercel serverless function. No CRED logos or brand assets are used.

## Features

- Search any supported city; submit by clicking Search or pressing Enter.
- One-click chips for New Delhi, Mumbai, Bengaluru, Hyderabad, Chennai, Kolkata, Pune, Patna, Jaipur, and London.
- Live Celsius temperature, condition/icon, feels-like temperature, humidity, wind, UV, cloud cover, direction, gust, and local time from WeatherAPI.
- Deterministic weather mood engine in `lib/mood.js` with documented priority order and boundary tests.
- Raw upstream response body and formatted syntax-highlighted JSON, with copy controls.
- Server-side API-key handling, response preservation, input validation, upstream timeout, stale-request protection, rate limiting, reduced-motion support, and responsive styles.

## Configure WeatherAPI locally

Node.js 20 or newer is recommended.

1. Copy `.env.example` to `.env`.
2. Set `WEATHERAPI_KEY` to your WeatherAPI.com key in `.env` (do not commit `.env`).
3. Install Vercel CLI if it is not available: `npm i -g vercel`.
4. Run `npm test` to run the automated tests.
5. Run `vercel dev` for local development. The UI calls only `/api/weather?city=...`; the browser never calls WeatherAPI directly.

## Deploy to Vercel

1. Import this folder into a Git repository that you control, or deploy it with the Vercel CLI from this directory.
2. In Vercel project settings, add `WEATHERAPI_KEY` as an **Environment Variable** for Development, Preview, and Production as needed. Use a current, valid key from WeatherAPI.com.
3. Deploy to Production and verify `/`, `/api/weather?city=Pune`, an unknown city, and a malformed request.
4. Do not put the WeatherAPI key or a Vercel token in source code, browser configuration, README files, Git, or a ZIP intended for sharing.

The included `vercel.json` sets the function timeout and common security headers. No framework or database is required.

## Mood priority

Rules are evaluated in this order: `Scorching` (temperature ≥ 38°C), `Freezing` (temperature ≤ 5°C), `Muggy` (humidity ≥ 80% and temperature ≥ 28°C), `Windy` (wind ≥ 30 km/h), `Pleasant` (20–30°C, humidity ≤ 60%, wind ≤ 20 km/h), `Comfortable` (15–30°C, humidity ≤ 75%, wind ≤ 30 km/h), then `Mixed`.

## Files

- `index.html` — semantic application structure
- `styles.css` — responsive visual design and motion/accessibility preferences
- `app.js` — client-side search, rendering, inspector tabs, and copy actions
- `api/weather.js` — Vercel serverless proxy for WeatherAPI
- `lib/mood.js` — reusable mood engine (Node + browser)
- `tests/` — built-in Node test suite
