import { getConfig, launchProxyBrowser, readExitIp } from "./common.js";

const config = getConfig();
const checks = Number(process.env.CHECKS || 5);
if (!Number.isInteger(checks) || checks < 2 || checks > 20) {
  throw new Error("CHECKS must be an integer from 2 to 20");
}
const observedIps = [];
for (let attempt = 1; attempt <= checks; attempt++) {
  // New browser per check reduces the chance of reusing the same proxy connection.
  const { browser, page } = await launchProxyBrowser(config, config.baseUsername);
  try {
    const result = await readExitIp(page, config.ipCheckUrl);
    observedIps.push(result.ip);
    console.log(JSON.stringify({ test: "rotating", attempt, ...result }));
  } catch (error) {
    console.error(`Attempt ${attempt} failed: ${error.message}`);
  } finally {
    await browser.close();
  }
  if (attempt < checks) await new Promise(resolve => setTimeout(resolve, 2000));
}
console.log("\n=== Rotation Test Summary ===");
console.log("Total checks:", checks);
console.log("Successful IP observations:", observedIps.length);
console.log("Unique IPs:", new Set(observedIps).size);
console.log("Observed IPs:", observedIps);
