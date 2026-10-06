import { createHash, createHmac, timingSafeEqual } from "node:crypto";
import { createServer } from "node:http";
import { resolve } from "node:path";
import { pathToFileURL } from "node:url";

export const DEFAULT_INSTAGRAM_WEBHOOK_PATH = "/webhooks/instagram";
export const DEFAULT_MAX_WEBHOOK_BODY_BYTES = 5 * 1024 * 1024;

function constantTimeStringEqual(actual, expected) {
  if (typeof actual !== "string" || typeof expected !== "string") return false;
  const actualBuffer = Buffer.from(actual, "utf8");
  const expectedBuffer = Buffer.from(expected, "utf8");
  return actualBuffer.length === expectedBuffer.length && timingSafeEqual(actualBuffer, expectedBuffer);
}

/** Return the Meta hub.challenge string only when mode and verify token match. */
export function verifyInstagramWebhookChallenge(searchParams, expectedVerifyToken) {
  if (!(searchParams instanceof URLSearchParams) || typeof expectedVerifyToken !== "string") return null;
  const mode = searchParams.get("hub.mode");
  const providedToken = searchParams.get("hub.verify_token");
  const challenge = searchParams.get("hub.challenge");
  if (
    mode !== "subscribe" ||
    !constantTimeStringEqual(providedToken, expectedVerifyToken) ||
    challenge === null ||
    challenge.length === 0
  ) {
    return null;
  }
  return challenge;
}

/** Verify Meta's sha256=<hex> signature against the exact, unparsed request bytes. */
export function verifyMetaWebhookSignature(rawBody, signatureHeader, appSecret) {
  if (!Buffer.isBuffer(rawBody) || typeof signatureHeader !== "string" || typeof appSecret !== "string" || !appSecret) {
    return false;
  }
  const match = /^sha256=([a-f0-9]{64})$/i.exec(signatureHeader);
  if (!match) return false;
  const provided = Buffer.from(match[1], "hex");
  const expected = createHmac("sha256", appSecret).update(rawBody).digest();
  return provided.length === expected.length && timingSafeEqual(provided, expected);
}

/** Return a stable per-body identifier that an application can persist for deduplication. */
export function getInstagramWebhookDeliveryId(rawBody) {
  if (!Buffer.isBuffer(rawBody)) throw new TypeError("rawBody must be a Buffer.");
  return createHash("sha256").update(rawBody).digest("hex");
}

export function summarizeInstagramWebhook(payload) {
  const fields = new Set();
  for (const entry of payload?.entry ?? []) {
    for (const change of entry?.changes ?? []) {
      if (typeof change?.field === "string") fields.add(change.field);
    }
    for (const event of entry?.messaging ?? []) {
      for (const key of Object.keys(event ?? {})) {
        if (!["sender", "recipient", "timestamp", "mid"].includes(key)) fields.add(key);
      }
    }
  }
  return {
    object: payload?.object,
    entryCount: Array.isArray(payload?.entry) ? payload.entry.length : 0,
    fields: [...fields].sort(),
  };
}

function sendText(response, statusCode, text) {
  if (response.headersSent) return;
  response.writeHead(statusCode, {
    "Cache-Control": "no-store",
    "Content-Length": Buffer.byteLength(text),
    "Content-Type": "text/plain; charset=utf-8",
  });
  response.end(text);
}

function readRawBody(request, maxBytes) {
  return new Promise((resolveBody, rejectBody) => {
    const chunks = [];
    let size = 0;
    let tooLarge = false;
    let settled = false;

    request.on("data", (chunk) => {
      size += chunk.length;
      if (size > maxBytes) {
        tooLarge = true;
        chunks.length = 0;
      } else if (!tooLarge) {
        chunks.push(chunk);
      }
    });
    request.on("end", () => {
      if (settled) return;
      settled = true;
      if (tooLarge) {
        const error = new Error("Webhook body exceeds the configured size limit.");
        error.code = "BODY_TOO_LARGE";
        rejectBody(error);
      } else {
        resolveBody(Buffer.concat(chunks));
      }
    });
    request.on("error", (error) => {
      if (settled) return;
      settled = true;
      rejectBody(error);
    });
    request.on("aborted", () => {
      if (settled) return;
      settled = true;
      rejectBody(new Error("Webhook request was aborted."));
    });
  });
}

/**
 * Create an HTTP server for Meta Instagram Platform Webhooks.
 * onNotification must enqueue/persist quickly before returning; Meta retries
 * failed deliveries and may send duplicates. Use deliveryId for durable dedupe.
 */
export function createInstagramWebhookServer({
  verifyToken,
  appSecret,
  onNotification,
  path = DEFAULT_INSTAGRAM_WEBHOOK_PATH,
  maxBodyBytes = DEFAULT_MAX_WEBHOOK_BODY_BYTES,
} = {}) {
  if (typeof verifyToken !== "string" || verifyToken.trim().length === 0) {
    throw new TypeError("verifyToken is required.");
  }
  if (typeof appSecret !== "string" || appSecret.trim().length === 0) {
    throw new TypeError("appSecret is required.");
  }
  if (typeof onNotification !== "function") {
    throw new TypeError("onNotification callback is required.");
  }
  if (typeof path !== "string" || !path.startsWith("/") || path.includes("?")) {
    throw new TypeError("path must be an absolute URL path, such as /webhooks/instagram.");
  }
  if (!Number.isSafeInteger(maxBodyBytes) || maxBodyBytes < 1) {
    throw new RangeError("maxBodyBytes must be a positive safe integer.");
  }

  return createServer(async (request, response) => {
    let requestUrl;
    try {
      requestUrl = new URL(request.url ?? "/", "http://localhost");
    } catch {
      sendText(response, 400, "Bad Request");
      return;
    }

    if (requestUrl.pathname === "/healthz" && request.method === "GET") {
      sendText(response, 200, "ok");
      return;
    }
    if (requestUrl.pathname !== path) {
      sendText(response, 404, "Not Found");
      return;
    }

    if (request.method === "GET") {
      const challenge = verifyInstagramWebhookChallenge(requestUrl.searchParams, verifyToken);
      if (challenge === null) {
        sendText(response, 403, "Forbidden");
        return;
      }
      sendText(response, 200, challenge);
      return;
    }

    if (request.method !== "POST") {
      response.setHeader("Allow", "GET, POST");
      sendText(response, 405, "Method Not Allowed");
      return;
    }

    let rawBody;
    try {
      rawBody = await readRawBody(request, maxBodyBytes);
    } catch (error) {
      if (error?.code === "BODY_TOO_LARGE") {
        sendText(response, 413, "Payload Too Large");
      } else {
        sendText(response, 400, "Bad Request");
      }
      return;
    }

    if (!verifyMetaWebhookSignature(rawBody, request.headers["x-hub-signature-256"], appSecret)) {
      sendText(response, 403, "Invalid Signature");
      return;
    }

    let payload;
    try {
      payload = JSON.parse(rawBody.toString("utf8"));
    } catch {
      sendText(response, 400, "Invalid JSON");
      return;
    }
    if (
      typeof payload !== "object" || payload === null || Array.isArray(payload) ||
      payload.object !== "instagram" || !Array.isArray(payload.entry)
    ) {
      sendText(response, 400, "Invalid Instagram Webhook Payload");
      return;
    }

    const deliveryId = getInstagramWebhookDeliveryId(rawBody);
    try {
      await onNotification(payload, {
        deliveryId,
        rawBody,
        receivedAt: new Date(),
      });
    } catch (error) {
      console.error("Instagram webhook handler failed:", error instanceof Error ? error.message : "unknown error");
      sendText(response, 500, "Notification Handler Failed");
      return;
    }

    sendText(response, 200, "EVENT_RECEIVED");
  });
}

export function startInstagramWebhookServer(env = process.env) {
  const verifyToken = env.INSTAGRAM_WEBHOOK_VERIFY_TOKEN;
  const appSecret = env.META_APP_SECRET;
  if (!verifyToken || !appSecret) {
    throw new Error("Set INSTAGRAM_WEBHOOK_VERIFY_TOKEN and META_APP_SECRET in the runtime environment.");
  }

  const port = Number(env.PORT ?? "3000");
  if (!Number.isInteger(port) || port < 1 || port > 65_535) {
    throw new RangeError("PORT must be an integer between 1 and 65535.");
  }
  const host = env.HOST || "0.0.0.0";
  const path = env.INSTAGRAM_WEBHOOK_PATH || DEFAULT_INSTAGRAM_WEBHOOK_PATH;

  const server = createInstagramWebhookServer({
    verifyToken,
    appSecret,
    path,
    onNotification: async (payload, context) => {
      // Demo behavior only: log a summary, never message/comment contents or IDs.
      // Replace this handler with a quick durable queue/database write in production.
      console.log(JSON.stringify({
        event: "instagram_webhook_received",
        deliveryId: context.deliveryId,
        ...summarizeInstagramWebhook(payload),
      }));
    },
  });

  server.listen(port, host, () => {
    console.log(`Instagram webhook receiver listening on ${host}:${port}${path}`);
    console.log("Demo handler logs summary only; connect durable event processing before production use.");
  });

  return server;
}

const invokedPath = process.argv[1] ? pathToFileURL(resolve(process.argv[1])).href : "";
if (import.meta.url === invokedPath) {
  try {
    const server = startInstagramWebhookServer();
    const shutdown = () => server.close(() => process.exit(0));
    process.once("SIGINT", shutdown);
    process.once("SIGTERM", shutdown);
  } catch (error) {
    console.error(error instanceof Error ? error.message : "Failed to start Instagram webhook server.");
    process.exitCode = 1;
  }
}
