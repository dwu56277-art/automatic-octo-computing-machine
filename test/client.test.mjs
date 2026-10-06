import assert from "node:assert/strict";
import { afterEach, test } from "node:test";
import { GoAnyApiClient, GoAnyApiError } from "../dist/index.js";

const originalFetch = globalThis.fetch;
afterEach(() => {
  globalThis.fetch = originalFetch;
});

function jsonResponse(body, { status = 200, headers = {} } = {}) {
  return new Response(JSON.stringify(body), {
    status,
    headers: { "content-type": "application/json", ...headers },
  });
}

test("calls official endpoint with Bearer token and encoded query parameters", async () => {
  let requestedUrl;
  let requestOptions;
  const client = new GoAnyApiClient({
    apiKey: "test-secret",
    fetch: async (url, options) => {
      requestedUrl = new URL(url);
      requestOptions = options;
      return jsonResponse({ code: "ok", message: "ok", data: { domain: "example.com", remainingCredits: 8 } });
    },
  });

  const data = await client.getTraffic({ domain: "example.com", month: 6 });

  assert.equal(data.domain, "example.com");
  assert.equal(requestedUrl.href, "https://api.goanyapi.com/api/v1/traffic?domain=example.com&month=6");
  assert.equal(requestOptions.method, "GET");
  assert.equal(requestOptions.headers.Authorization, "Bearer test-secret");
});

test("returns free credit-balance endpoint data", async () => {
  let requestedUrl;
  const client = new GoAnyApiClient({
    apiKey: "test-secret",
    fetch: async (url) => {
      requestedUrl = new URL(url);
      return jsonResponse({ code: "ok", data: { remainingCredits: 42 } });
    },
  });

  assert.deepEqual(await client.getCreditBalance(), { remainingCredits: 42 });
  assert.equal(requestedUrl.pathname, "/api/v1/credits/balance");
});

test("surfaces HTTP errors and Retry-After", async () => {
  const client = new GoAnyApiClient({
    apiKey: "test-secret",
    fetch: async () => jsonResponse(
      { code: "rate_limit_exceeded", message: "Try again shortly", details: { limitPerSecond: 5 } },
      { status: 429, headers: { "Retry-After": "2" } },
    ),
  });

  await assert.rejects(client.getSerp({ q: "test" }), (error) => {
    assert.ok(error instanceof GoAnyApiError);
    assert.equal(error.status, 429);
    assert.equal(error.code, "rate_limit_exceeded");
    assert.equal(error.retryAfter, "2");
    assert.deepEqual(error.details, { limitPerSecond: 5 });
    return true;
  });
});

test("surfaces API business errors even when HTTP status is 200", async () => {
  const client = new GoAnyApiClient({
    apiKey: "test-secret",
    fetch: async () => jsonResponse({ code: "insufficient_credits", message: "Not enough credits" }),
  });

  await assert.rejects(client.getBacklinks({ domain: "example.com" }), (error) => {
    assert.ok(error instanceof GoAnyApiError);
    assert.equal(error.code, "insufficient_credits");
    return true;
  });
});

test("validates credentials and endpoint parameters before making a request", async () => {
  assert.throws(() => new GoAnyApiClient({ apiKey: "  " }), /API key is required/);

  const client = new GoAnyApiClient({ apiKey: "test-secret", fetch: async () => {
    throw new Error("fetch should not run for invalid input");
  } });

  assert.throws(() => client.getTraffic({ domain: "example.com", month: 4 }), /month must be 3, 6, or 12/);
  assert.throws(() => client.getSerp({ q: "" }), /q must be a non-empty string/);
  assert.throws(() => client.getKeywordSuggestions({ keyword: "test", page: -1 }), /page must be an integer/);
});
