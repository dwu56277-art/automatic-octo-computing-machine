import assert from "node:assert/strict";
import { createHmac } from "node:crypto";
import { test } from "node:test";
import {
  createInstagramWebhookServer,
  getInstagramWebhookDeliveryId,
  verifyInstagramWebhookChallenge,
  verifyMetaWebhookSignature,
} from "../server/instagram-webhook.mjs";

const VERIFY_TOKEN = "test-verify-token";
const APP_SECRET = "test-app-secret";

function sign(body) {
  return `sha256=${createHmac("sha256", APP_SECRET).update(body).digest("hex")}`;
}

async function startTestServer(t, options = {}) {
  const server = createInstagramWebhookServer({
    verifyToken: VERIFY_TOKEN,
    appSecret: APP_SECRET,
    onNotification: async () => {},
    ...options,
  });
  await new Promise((resolve, reject) => {
    server.once("error", reject);
    server.listen(0, "127.0.0.1", resolve);
  });
  t.after(async () => {
    await new Promise((resolve) => {
      server.close(resolve);
      server.closeAllConnections?.();
    });
  });
  const { port } = server.address();
  return { server, baseUrl: `http://127.0.0.1:${port}` };
}

test("verifies the exact Meta GET challenge token and returns the challenge", async (t) => {
  const { baseUrl } = await startTestServer(t);
  const validUrl = new URL("/webhooks/instagram", baseUrl);
  validUrl.searchParams.set("hub.mode", "subscribe");
  validUrl.searchParams.set("hub.verify_token", VERIFY_TOKEN);
  validUrl.searchParams.set("hub.challenge", "challenge-123");

  const valid = await fetch(validUrl);
  assert.equal(valid.status, 200);
  assert.equal(await valid.text(), "challenge-123");

  validUrl.searchParams.set("hub.verify_token", "wrong-token");
  const invalid = await fetch(validUrl);
  assert.equal(invalid.status, 403);
});

test("validates HMAC SHA-256 over the unchanged raw body", () => {
  const rawBody = Buffer.from('{"object":"instagram","entry":[]}');
  assert.equal(verifyMetaWebhookSignature(rawBody, sign(rawBody), APP_SECRET), true);
  assert.equal(verifyMetaWebhookSignature(rawBody, sign(rawBody), "wrong-secret"), false);
  assert.equal(verifyMetaWebhookSignature(Buffer.from(`${rawBody.toString()} `), sign(rawBody), APP_SECRET), false);
  assert.equal(verifyMetaWebhookSignature(rawBody, "sha256=not-a-signature", APP_SECRET), false);
});

test("accepts signed Instagram notifications and passes a stable delivery ID to the handler", async (t) => {
  const payload = {
    object: "instagram",
    entry: [{ id: "account-1", time: 1_700_000_000, changes: [{ field: "comments", value: { id: "comment-1" } }] }],
  };
  const rawBody = Buffer.from(JSON.stringify(payload));
  let callbackArgs;
  const { baseUrl } = await startTestServer(t, {
    onNotification: async (...args) => { callbackArgs = args; },
  });

  const response = await fetch(`${baseUrl}/webhooks/instagram`, {
    method: "POST",
    headers: { "content-type": "application/json", "x-hub-signature-256": sign(rawBody) },
    body: rawBody,
  });

  assert.equal(response.status, 200);
  assert.equal(await response.text(), "EVENT_RECEIVED");
  assert.deepEqual(callbackArgs[0], payload);
  assert.equal(callbackArgs[1].deliveryId, getInstagramWebhookDeliveryId(rawBody));
  assert.equal(callbackArgs[1].rawBody.toString(), rawBody.toString());
  assert.ok(callbackArgs[1].receivedAt instanceof Date);
});

test("rejects invalid signatures before invoking the notification handler", async (t) => {
  let called = false;
  const { baseUrl } = await startTestServer(t, {
    onNotification: async () => { called = true; },
  });
  const rawBody = Buffer.from(JSON.stringify({ object: "instagram", entry: [] }));

  const response = await fetch(`${baseUrl}/webhooks/instagram`, {
    method: "POST",
    headers: { "x-hub-signature-256": sign(rawBody).replace(/[a-f0-9]/gi, "0") },
    body: rawBody,
  });

  assert.equal(response.status, 403);
  assert.equal(called, false);
});

test("rejects signed malformed JSON and non-Instagram payloads", async (t) => {
  const { baseUrl } = await startTestServer(t);
  const malformed = Buffer.from("not-json");
  const malformedResponse = await fetch(`${baseUrl}/webhooks/instagram`, {
    method: "POST",
    headers: { "x-hub-signature-256": sign(malformed) },
    body: malformed,
  });
  assert.equal(malformedResponse.status, 400);

  const wrongObject = Buffer.from(JSON.stringify({ object: "page", entry: [] }));
  const payloadResponse = await fetch(`${baseUrl}/webhooks/instagram`, {
    method: "POST",
    headers: { "x-hub-signature-256": sign(wrongObject) },
    body: wrongObject,
  });
  assert.equal(payloadResponse.status, 400);
});

test("enforces the configured maximum request body size", async (t) => {
  const { baseUrl } = await startTestServer(t, { maxBodyBytes: 16 });
  const rawBody = Buffer.from(JSON.stringify({ object: "instagram", entry: [] }));
  const response = await fetch(`${baseUrl}/webhooks/instagram`, {
    method: "POST",
    headers: { "x-hub-signature-256": sign(rawBody) },
    body: rawBody,
  });
  assert.equal(response.status, 413);
});

test("rejects missing webhook secrets and callback handlers at server creation", () => {
  assert.throws(() => createInstagramWebhookServer(), /verifyToken is required/);
  assert.throws(() => createInstagramWebhookServer({ verifyToken: VERIFY_TOKEN, appSecret: APP_SECRET }), /onNotification callback is required/);
});

test("challenge helper returns null for invalid or incomplete requests", () => {
  const valid = new URLSearchParams({
    "hub.mode": "subscribe",
    "hub.verify_token": VERIFY_TOKEN,
    "hub.challenge": "abc",
  });
  assert.equal(verifyInstagramWebhookChallenge(valid, VERIFY_TOKEN), "abc");
  assert.equal(verifyInstagramWebhookChallenge(valid, "different"), null);
  assert.equal(verifyInstagramWebhookChallenge(new URLSearchParams(), VERIFY_TOKEN), null);
});
