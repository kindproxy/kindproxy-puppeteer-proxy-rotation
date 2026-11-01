import { getConfig, launchProxyBrowser, readExitIp } from "./common.js";

const mode = (process.env.RETRY_TEST_MODE || "normal").toLowerCase();
const supported = new Set(["normal", "timeout", "http503", "http429"]);
if (!supported.has(mode)) throw new Error(`Invalid RETRY_TEST_MODE: ${mode}`);

const maxAttempts = 3;
const baseDelayMs = 1000;
const maxDelayMs = 30_000;
const sleep = ms => new Promise(resolve => setTimeout(resolve, ms));

function classifyError(error) {
  const message = String(error?.message ?? error);
  if (/407|ERR_INVALID_AUTH_CREDENTIALS|ERR_PROXY_AUTH/i.test(message)) return "proxy_auth";
  if (error?.name === "TimeoutError" || /ETIMEDOUT|ERR_TIMED_OUT/i.test(message)) return "timeout";
  if (/ECONNRESET|ERR_CONNECTION_RESET|ERR_PROXY_CONNECTION_FAILED/i.test(message)) return "transient_network";
  return "unknown";
}

function retryAfterMs(header) {
  if (!header) return null;
  const seconds = Number(header);
  if (Number.isFinite(seconds) && seconds >= 0) return seconds * 1000;
  const date = Date.parse(header);
  return Number.isNaN(date) ? null : Math.max(0, date - Date.now());
}

function backoff(attempt) {
  return Math.min(maxDelayMs, baseDelayMs * 2 ** (attempt - 1)) + Math.floor(Math.random() * 250);
}

async function runWithRetries(task) {
  for (let attempt = 1; attempt <= maxAttempts; attempt++) {
    const started = Date.now();
    try {
      const result = await task(attempt);
      const status = result.status;
      console.log(JSON.stringify({ event: "attempt", attempt, status, duration_ms: Date.now() - started }));

      if (status === 429) {
        const wait = retryAfterMs(result.retryAfter);
        console.warn(JSON.stringify({ event: "rate_limited", attempt, retry_after_ms: wait, action: "stop_and_reduce_rate" }));
        return { outcome: "rate_limited", attempt, status, retryAfterMs: wait };
      }
      if (status === 401 || status === 403 || status === 407) {
        console.warn(JSON.stringify({ event: "non_retryable_status", attempt, status }));
        return { outcome: "non_retryable", attempt, status };
      }
      if (status >= 500 && status <= 599) {
        if (attempt === maxAttempts) return { outcome: "retry_exhausted", attempt, status };
        const delay = backoff(attempt);
        console.warn(JSON.stringify({ event: "retry_scheduled", attempt, reason: `http_${status}`, delay_ms: delay }));
        await sleep(delay);
        continue;
      }
      return { outcome: "success", attempt, ...result };
    } catch (error) {
      const category = classifyError(error);
      console.warn(JSON.stringify({ event: "exception", attempt, category, message: error.message }));
      if (!["timeout", "transient_network"].includes(category)) throw error;
      if (attempt === maxAttempts) return { outcome: "retry_exhausted", attempt, category };
      const delay = backoff(attempt);
      console.warn(JSON.stringify({ event: "retry_scheduled", attempt, reason: category, delay_ms: delay }));
      await sleep(delay);
    }
  }
  throw new Error("Unexpected retry loop termination");
}

async function main() {
  console.log(`Retry test mode: ${mode}`);
  // Simulated failures are local; no proxy credentials needed until a real success check.
  let browser;
  let page;
  try {
    const result = await runWithRetries(async attempt => {
      if (mode === "timeout" && attempt <= 2) {
        const error = new Error("Simulated navigation timeout");
        error.name = "TimeoutError";
        throw error;
      }
      if (mode === "http503" && attempt <= 2) {
        return { status: 503 };
      }
      if (mode === "http429") {
        return { status: 429, retryAfter: "5" };
      }
      if (!browser) {
        const config = getConfig();
        ({ browser, page } = await launchProxyBrowser(config, config.baseUsername));
      }
      const config = getConfig();
      const observed = await readExitIp(page, config.ipCheckUrl);
      return { status: observed.status, ip: observed.ip, observedAt: observed.observedAt };
    });
    console.log("Final result:", JSON.stringify(result));
    if (result.outcome !== "success" && result.outcome !== "rate_limited") process.exitCode = 1;
  } finally {
    if (browser) await browser.close();
  }
}

main().catch(error => {
  console.error("Fatal:", error.message);
  process.exitCode = 1;
});
