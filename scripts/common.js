import "dotenv/config";
import puppeteer from "puppeteer";

export function getConfig() {
  const required = [
    "KP_PROXY_HOST",
    "KP_PROXY_PORT",
    "KP_PROXY_USER_BASE",
    "KP_PROXY_PASSWORD"
  ];

  for (const key of required) {
    if (!process.env[key]) {
      throw new Error(`Missing required environment variable: ${key}`);
    }
  }

  const baseUsername = process.env.KP_PROXY_USER_BASE.trim();

  // Avoid accidentally appending duplicate session parameters.
  if (/(^|;)sessid\./i.test(baseUsername) || /(^|;)sessttl\./i.test(baseUsername)) {
    throw new Error(
      "KP_PROXY_USER_BASE must not already contain sessid or sessttl parameters."
    );
  }

  return {
    host: process.env.KP_PROXY_HOST,
    port: process.env.KP_PROXY_PORT,
    baseUsername,
    password: process.env.KP_PROXY_PASSWORD,
    ipCheckUrl: process.env.IP_CHECK_URL || "https://api.ipify.org?format=json"
  };
}

export function buildSessionUsername(baseUsername, sessionId, ttlMinutes) {
  if (!/^[A-Za-z0-9_-]{1,64}$/.test(sessionId)) {
    throw new Error(
      "Session ID must be 1-64 characters and contain only letters, numbers, '_' or '-'."
    );
  }

  const ttl = Number(ttlMinutes);
  if (!Number.isInteger(ttl) || ttl < 1 || ttl > 1440) {
    throw new Error("Session TTL must be an integer from 1 to 1440 minutes.");
  }

  return `${baseUsername};sessid.${sessionId};sessttl.${ttl}`;
}

export async function launchProxyBrowser(config, username) {
  const browser = await puppeteer.launch({
    headless: true,
    args: [
      `--proxy-server=http://${config.host}:${config.port}`,
      "--no-sandbox",
      "--disable-setuid-sandbox"
    ]
  });

  const page = await browser.newPage();
  await page.authenticate({
    username,
    password: config.password
  });

  page.setDefaultNavigationTimeout(45_000);
  return { browser, page };
}

export async function readExitIp(page, url) {
  const response = await page.goto(url, {
    waitUntil: "domcontentloaded",
    timeout: 45_000
  });

  const body = await page.$eval("body", el => el.innerText.trim());

  let parsed;
  try {
    parsed = JSON.parse(body);
  } catch {
    parsed = null;
  }

  return {
    status: response?.status() ?? null,
    ip: parsed?.ip ?? body,
    observedAt: new Date().toISOString()
  };
}
