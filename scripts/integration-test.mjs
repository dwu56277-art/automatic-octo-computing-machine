#!/usr/bin/env node
import { GoAnyApiClient, GoAnyApiError } from "../dist/index.js";

const args = new Set(process.argv.slice(2));
const knownArgs = new Set(["--confirm-paid", "--free-only", "--help"]);
const unknownArgs = [...args].filter((arg) => !knownArgs.has(arg));

function usage() {
  console.log(`GoAnyAPI live integration test

Usage:
  GOANYAPI_API_KEY=... npm run test:integration -- --confirm-paid
  GOANYAPI_API_KEY=... npm run test:integration -- --free-only

Options:
  --confirm-paid  Explicitly allow requests to paid endpoints (credit usage).
  --free-only     Test only the free credit-balance endpoint.
  --help          Show this help.

Optional environment variables:
  GOANYAPI_BASE_URL       API root (defaults to ${"https://api.goanyapi.com/api/v1"})
  GOANYAPI_TEST_DOMAIN    Domain for traffic/backlink tests (defaults to example.com)
  GOANYAPI_TEST_QUERY     Google SERP query (defaults to seo)
  GOANYAPI_TEST_KEYWORD   Keyword for keyword tests (defaults to seo)
  GOANYAPI_MIN_CREDITS    Abort paid tests if balance is below this number
`);
}

if (args.has("--help")) {
  usage();
  process.exit(0);
}
if (unknownArgs.length > 0 || (args.has("--free-only") && args.has("--confirm-paid"))) {
  console.error(`Invalid options: ${unknownArgs.join(", ") || "--free-only cannot be combined with --confirm-paid"}`);
  usage();
  process.exit(2);
}

const apiKey = process.env.GOANYAPI_API_KEY?.trim();
if (!apiKey) {
  console.error("Missing GOANYAPI_API_KEY. Set it in your shell/secret store; never commit it to the repository.");
  process.exit(2);
}

const freeOnly = args.has("--free-only");
if (!freeOnly && !args.has("--confirm-paid")) {
  console.error(
    "Paid API calls may consume credits. No request was sent. Re-run with --confirm-paid to opt in, " +
    "or use --free-only to test credentials and the free credit-balance endpoint.",
  );
  process.exit(2);
}

const baseUrl = process.env.GOANYAPI_BASE_URL;
const client = new GoAnyApiClient({
  apiKey,
  ...(baseUrl ? { baseUrl } : {}),
});

const failures = [];
const startedAt = Date.now();

function assertObject(name, value) {
  if (typeof value !== "object" || value === null || Array.isArray(value)) {
    throw new Error(`${name} did not return an object.`);
  }
}

function assertEndpoint(data, expected) {
  assertObject(expected, data);
  if (data.endpoint !== expected) {
    throw new Error(`Expected data.endpoint=${expected}; received ${String(data.endpoint)}.`);
  }
}

function formatError(error) {
  if (error instanceof GoAnyApiError) {
    const parts = [];
    if (error.status !== undefined) parts.push(`HTTP ${error.status}`);
    if (error.code) parts.push(error.code);
    parts.push(error.message);
    if (error.retryAfter) parts.push(`Retry-After: ${error.retryAfter}`);
    return parts.join(" | ");
  }
  return error instanceof Error ? error.message : String(error);
}

async function runCheck(name, call, validate) {
  const started = Date.now();
  try {
    const data = await call();
    validate(data);
    console.log(`PASS ${name} (${Date.now() - started} ms)`);
    return data;
  } catch (error) {
    const message = formatError(error);
    failures.push({ name, message });
    console.error(`FAIL ${name} (${Date.now() - started} ms): ${message}`);
    return undefined;
  }
}

const balance = await runCheck("credits/balance (free preflight)", () => client.getCreditBalance(), (data) => {
  assertObject("credits/balance", data);
  if (!Number.isFinite(data.remainingCredits) || data.remainingCredits < 0) {
    throw new Error("remainingCredits is missing or invalid.");
  }
});

if (balance === undefined) {
  console.error("Stopping before paid tests because the free preflight failed.");
  process.exit(1);
}

console.log(`Available credits before tests: ${balance.remainingCredits}`);

if (freeOnly) {
  console.log("Paid endpoints were not called (--free-only).");
  console.log(failures.length === 0 ? "Integration test passed." : "Integration test failed.");
  process.exit(failures.length === 0 ? 0 : 1);
}

const minCreditsValue = process.env.GOANYAPI_MIN_CREDITS;
if (minCreditsValue !== undefined) {
  const minimum = Number(minCreditsValue);
  if (!Number.isFinite(minimum) || minimum < 0) {
    console.error("GOANYAPI_MIN_CREDITS must be a non-negative number.");
    process.exit(2);
  }
  if (balance.remainingCredits < minimum) {
    console.error(
      `Only ${balance.remainingCredits} credits are available; GOANYAPI_MIN_CREDITS=${minimum}. ` +
      "No paid requests were sent.",
    );
    process.exit(2);
  }
}

const domain = process.env.GOANYAPI_TEST_DOMAIN?.trim() || "example.com";
const query = process.env.GOANYAPI_TEST_QUERY?.trim() || "seo";
const keyword = process.env.GOANYAPI_TEST_KEYWORD?.trim() || "seo";

console.log("\nPaid endpoint checks enabled. Successful calls may deduct credits at GoAnyAPI's current configured rates.");
console.log("Testing traffic, SERP, backlinks, keyword difficulty, suggestions, search volume, and keyword generator.\n");

await runCheck("traffic", () => client.getTraffic({ domain, month: 3 }), (data) => assertEndpoint(data, "traffic"));
await runCheck(
  "serp",
  () => client.getSerp({ q: query, gl: "us", hl: "en", search_type: "web", device: "desktop" }),
  (data) => {
    assertEndpoint(data, "serp");
    assertObject("serp.result", data.result);
  },
);
await runCheck("backlink", () => client.getBacklinks({ domain }), (data) => {
  assertEndpoint(data, "backlink");
  if (!Number.isFinite(data.backlinks) || !Number.isFinite(data.refdomains)) {
    throw new Error("Expected backlink and refdomains metrics in the response.");
  }
});
await runCheck(
  "keyword-difficulty",
  () => client.getKeywordDifficulty({ keyword, country: "us" }),
  (data) => {
    assertEndpoint(data, "keyword-difficulty");
    if (!Number.isFinite(data.difficulty)) throw new Error("difficulty is missing or invalid.");
  },
);

const suggestions = await runCheck(
  "keyword-suggestions",
  () => client.getKeywordSuggestions({ keyword, page: 0 }),
  (data) => {
    assertEndpoint(data, "keyword-suggestions");
    if (!Array.isArray(data.keywords)) throw new Error("keywords is missing or is not an array.");
  },
);

const exactKeyword = suggestions?.keywords?.find((item) => typeof item === "string" && item.trim().length > 0);
if (exactKeyword) {
  await runCheck("keyword-search-volume (using an exact returned suggestion)", () =>
    client.getKeywordSearchVolume({ keyword: exactKeyword }), (data) => {
    assertEndpoint(data, "keyword-search-volume");
    if (!Array.isArray(data.monthlyVolumes)) throw new Error("monthlyVolumes is missing or is not an array.");
  });
} else if (suggestions !== undefined) {
  console.log("SKIP keyword-search-volume: suggestions returned no exact keyword to query.");
}

await runCheck("keyword-generator", () => client.generateKeywords({ keyword, country: "us" }), (data) => {
  assertEndpoint(data, "keyword-generator");
  if (!Array.isArray(data.allIdeas) || !Array.isArray(data.questionIdeas)) {
    throw new Error("Expected allIdeas and questionIdeas arrays in the response.");
  }
});

const finalBalance = await runCheck("credits/balance (free postflight)", () => client.getCreditBalance(), (data) => {
  assertObject("credits/balance", data);
  if (!Number.isFinite(data.remainingCredits) || data.remainingCredits < 0) {
    throw new Error("remainingCredits is missing or invalid.");
  }
});

if (finalBalance !== undefined) {
  console.log(`Available credits after tests: ${finalBalance.remainingCredits}`);
  console.log(`Credit balance change: ${finalBalance.remainingCredits - balance.remainingCredits}`);
}

console.log(`\nFinished in ${Date.now() - startedAt} ms. Passed checks are listed above; failures: ${failures.length}.`);
if (failures.length > 0) {
  process.exitCode = 1;
} else {
  console.log("Integration test passed.");
}
