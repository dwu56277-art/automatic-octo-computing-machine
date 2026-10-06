import assert from "node:assert/strict";
import { spawnSync } from "node:child_process";
import { fileURLToPath } from "node:url";
import { test } from "node:test";

const projectRoot = fileURLToPath(new URL("../", import.meta.url));
const scriptPath = fileURLToPath(new URL("../scripts/integration-test.mjs", import.meta.url));

function runScript({ apiKey, args = [] }) {
  const env = { ...process.env };
  delete env.GOANYAPI_API_KEY;
  delete env.GOANYAPI_BASE_URL;
  delete env.GOANYAPI_MIN_CREDITS;
  if (apiKey !== undefined) env.GOANYAPI_API_KEY = apiKey;
  return spawnSync(process.execPath, [scriptPath, ...args], {
    cwd: projectRoot,
    env,
    encoding: "utf8",
    timeout: 5_000,
  });
}

test("live integration script refuses to run without an API key", () => {
  const result = runScript({});
  assert.equal(result.status, 2);
  assert.match(result.stderr, /Missing GOANYAPI_API_KEY/);
});

test("live integration script sends no request without explicit paid-test consent", () => {
  const result = runScript({ apiKey: "placeholder-not-a-real-key" });
  assert.equal(result.status, 2);
  assert.match(result.stderr, /No request was sent/);
  assert.match(result.stderr, /--confirm-paid/);
});
