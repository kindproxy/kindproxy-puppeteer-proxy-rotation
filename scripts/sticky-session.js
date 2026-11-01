import {
  getConfig,
  buildSessionUsername,
  launchProxyBrowser,
  readExitIp
} from "./common.js";

const config = getConfig();
const sessionId = process.env.KP_SESSION_ID || "product-check-42";
const ttlMinutes = process.env.KP_SESSION_TTL_MINUTES || "10";
const username = buildSessionUsername(config.baseUsername, sessionId, ttlMinutes);
const checks = Number(process.env.CHECKS || 5);

if (!Number.isInteger(checks) || checks < 2 || checks > 20) {
  throw new Error("CHECKS must be an integer between 2 and 20.");
}

const { browser, page } = await launchProxyBrowser(config, username);

try {
  console.log(`Checking sticky session "${sessionId}" (${ttlMinutes} minute TTL).`);

  for (let i = 1; i <= checks; i += 1) {
    const result = await readExitIp(page, config.ipCheckUrl);
    console.log(JSON.stringify({
      test: "sticky",
      sessionId,
      attempt: i,
      ...result
    }));

    if (i < checks) {
      await new Promise(resolve => setTimeout(resolve, 1500));
    }
  }

  console.log(
    "Compare the observed IPs. Session behavior is subject to the provider's configured rules and resource availability."
  );
} finally {
  await browser.close();
}
