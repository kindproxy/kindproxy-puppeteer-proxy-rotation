# Puppeteer Proxy Rotation: Sticky Sessions, Retries, and Error Handling

Runnable Node.js examples for KindProxy residential proxy workflows. They demonstrate provider-managed rotating exits, sticky session verification, and bounded error handling. **Rotation/sticky results below are user-observed runs; timeout, 503, and 429 failures are deliberately simulated.**

![Masked terminal test results](https://cdn.kindproxy.com/blog_images/puppyteer-test.png)

## Requirements

- Node.js 18+ and npm
- A working KindProxy rotating residential proxy endpoint and credentials
- Chromium dependencies supported by Puppeteer on your system

## Install

```bash
npm install
cp .env.example .env
```

Edit `.env` using credentials from your KindProxy dashboard. The base username includes targeting fields but **must not include** `sessid` or `sessttl`. Never commit `.env`.

```dotenv
KP_PROXY_HOST=gw.kindproxy.com
KP_PROXY_PORT=12000
KP_PROXY_USER_BASE=YOUR_DASHBOARD_USERNAME__cr.us
KP_PROXY_PASSWORD=YOUR_PASSWORD
KP_SESSION_ID=product-check-42
KP_SESSION_TTL_MINUTES=10
IP_CHECK_URL=https://api.ipify.org?format=json
```

The host, port, and username are examples. Confirm the `sessid` / `sessttl` syntax and supported TTL range against your current dashboard before running. The example's code currently validates TTL 1–1440 minutes; adjust it if your account's supported range differs.

## Run

```bash
npm run rotate
npm run sticky
RETRY_TEST_MODE=timeout npm run retry
RETRY_TEST_MODE=http503 npm run retry
RETRY_TEST_MODE=http429 npm run retry
npm run retry
```

`rotate` launches a fresh browser for each check to reduce proxy connection reuse. It does **not** guarantee a new IP each time. `sticky` reuses one browser and session ID for multiple checks; a successful short test does not establish full-TTL availability.

`retry` runs simulated failures for `timeout`, `http503`, and `http429`. Timeout and 503 simulations succeed on attempt 3 via a real IP check; the 429 simulation stops after attempt 1 and reports `Retry-After` without waiting or rotating. `normal` performs one real proxy check when successful.

## Observations (2026-11-01)

| Test | Observed result | Evidence type |
| --- | --- | --- |
| Rotating | 5 successful checks; 5 distinct observed exits after fresh browser launches | Real proxy checks |
| Sticky (`product-check-42`, TTL configured 10 min) | 5 successful checks; one consistent exit over approximately 7 seconds | Real proxy checks |
| Timeout | Simulated failures on attempts 1 and 2; attempt 3 real IP check returned HTTP 200 | Simulated error + real final check |
| HTTP 503 | Simulated 503 on attempts 1 and 2; attempt 3 real IP check returned HTTP 200 | Simulated error + real final check |
| HTTP 429 | Simulated 429 with `Retry-After: 5`; stopped at attempt 1 | Simulation only |

IP addresses are masked in the infographic. These are observations from a small test, not guarantees of future allocation, full TTL behavior, or production reliability.

## Security and limitations

- Only access pages you are permitted to access; respect rate limits and site policies.
- Do not use session changes to bypass access controls or 429 responses.
- Never publish passwords or full proxy usernames; logs may contain exit IPs.
- `retry-handler.js` is a teaching demonstration, not a production job queue. Its 429 handling reports the delay and stops; it does not automatically schedule a later request.
- `page.authenticate()` handles HTTP authentication; do not enable request interception without resolving every intercepted request.
- To verify distinct sessions, TTL expiration, or offline-resource behavior, add controlled tests and record the conditions.

## Links

- [KindProxy Puppeteer setup guide](https://www.kindproxy.com/blog/en/blog/puppeteer-kindproxy-residential-proxy-guide-2026/)
- [KindProxy Residential Proxies](https://www.kindproxy.com/pricing/residential-proxies/traffic/?spread=github)
- [Puppeteer HTTP authentication documentation](https://pptr.dev/api/puppeteer.page.authenticate)
