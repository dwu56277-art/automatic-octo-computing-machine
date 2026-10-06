# Instagram Platform Webhooks 接入

本專案目前沒有既有 Web framework/server，因此提供一個不需第三方套件的 Node.js HTTP receiver：`server/instagram-webhook.mjs`。它處理 Meta 的 callback 驗證與簽章驗證，並將已驗證的通用 Instagram payload 傳給 `onNotification(payload, context)` 回呼。

## 功能與安全邊界

- `GET /webhooks/instagram`：驗證 `hub.mode=subscribe` 與 `hub.verify_token`，成功時原樣回傳 `hub.challenge`。
- `POST /webhooks/instagram`：先以 App Secret 對**原始 request bytes**驗證 `X-Hub-Signature-256: sha256=...`，再解析 JSON，確認 `object=instagram` 及 `entry` 陣列。
- 使用 constant-time compare 驗證 token／簽章；預設限制 body 為 5 MiB。
- 將穩定的 body SHA-256 `deliveryId` 傳給 app handler，供持久化去重。
- `/healthz` 可作為服務健康檢查。
- 不自動回覆 Instagram 訊息、不選擇或建立 webhook fields、不保存 payload，也不會代替你設定 Meta App Dashboard。

Standalone 範例 handler **只記錄事件欄位摘要，不記錄訊息／留言內文或帳號 ID，也不保存通知**。在接上正式業務邏輯前，不要把它當作已完成的生產事件處理器。請將 `onNotification` 接到快速的持久 queue/database，再由 worker 做較慢的處理；以 `deliveryId` 做持久去重。Meta 會重送未成功的通知，應用程式需可冪等處理。

## 本機啟動

需 Node.js 18 或更新版本。設定 Meta App Secret 及自選的 Verify Token（Verify Token 由你產生，並需在 Dashboard 填入相同值）：

```bash
export META_APP_SECRET='從 Meta App Dashboard 安全取得'
export INSTAGRAM_WEBHOOK_VERIFY_TOKEN='自行產生的長隨機字串'
export PORT=3000
node server/instagram-webhook.mjs
```

預設 callback path 為 `/webhooks/instagram`。可用 `INSTAGRAM_WEBHOOK_PATH` 覆寫。Server 預設綁定 `0.0.0.0`，但本機 HTTP URL 不可直接作為 Meta 正式 callback。

## Meta App Dashboard 設定

1. 部署此 receiver 至可從公開網際網路連線的 **HTTPS** 網址，並使用有效、受信任的 TLS 憑證；Meta 不接受 self-signed certificate。若 TLS 在反向代理／平台終結，請將路徑轉送至此 Node server。
2. 在 Meta App Dashboard 的 Instagram API/Webhooks 設定選 Instagram webhook object，填入完整 callback URL，例如 `https://your-domain.example/webhooks/instagram`，並在 Verify Token 欄位填入與 `INSTAGRAM_WEBHOOK_VERIFY_TOKEN` 相同的值。Meta 會發 GET challenge；成功後應看到 callback 驗證通過。
3. 只訂閱應用程式真正需要的 fields。可用 fields、權限與登入方式有關；請先看官方 [fields and permissions 表](https://developers.facebook.com/documentation/instagram-platform/webhooks/fields)。接收器支援一般化 payload，不代表 App 已有相應權限或訂閱。
4. 啟用每個 professional account 的通知訂閱，並完成所需 OAuth 權限／App Review／Advanced Access／Business Verification。production 要求視登入方式與 field 而異。
5. 在 Dashboard 使用 Test 送一筆測試通知；再以實際授權的 Instagram Business/Creator account 測事件，確認 handler 收到、簽章通過、及回應 200。

### Instagram API 登入方式會影響帳號訂閱

- **Instagram Login**：使用 Instagram User access token，官方文件示例使用 `graph.instagram.com/{IG_ACCOUNT_ID}/subscribed_apps`。
- **Facebook Login**：Instagram professional account 必須連結 Facebook Page，使用 Page access token，官方文件示例使用 `graph.facebook.com/{PAGE_ID}/subscribed_apps`。
- Instagram Messaging through Messenger Platform 有其自己的權限與 webhook setup；若目標是私訊，應依該產品文件設定，不要直接套用留言或 insights 欄位。

請依所選登入方式及目前 Meta 文件執行帳號層級訂閱；本 repo 不會儲存或代送 access token。

## 在既有 Node app 中掛接

可直接使用 receiver factory，而不必啟動 standalone 範例：

```js
import { createInstagramWebhookServer } from "./server/instagram-webhook.mjs";

const server = createInstagramWebhookServer({
  verifyToken: process.env.INSTAGRAM_WEBHOOK_VERIFY_TOKEN,
  appSecret: process.env.META_APP_SECRET,
  onNotification: async (payload, { deliveryId, receivedAt }) => {
    // 優先快速寫入持久 queue/database；不要在 webhook request 中做慢操作。
    await durableQueue.enqueue({ deliveryId, receivedAt, payload });
  },
});

server.listen(Number(process.env.PORT ?? 3000), "0.0.0.0");
```

handler 完成持久 enqueue 後 receiver 才回 `200 EVENT_RECEIVED`；若 handler 丟出錯誤則回 500，讓 Meta 重試。請為資料庫／queue 寫入加上 `deliveryId` 唯一鍵，避免重送造成重複副作用。

## 測試

本機 tests 使用 Node 內建 HTTP server 與測試密鑰，不會連到 Meta：

```bash
node --test test/instagram-webhook.test.mjs
```

## 官方文件

- [Instagram Webhooks overview](https://developers.facebook.com/documentation/instagram-platform/webhooks)
- [Setup Instagram Webhooks](https://developers.facebook.com/documentation/instagram-platform/webhooks/setup)
- [Fields and permissions](https://developers.facebook.com/documentation/instagram-platform/webhooks/fields)
- [Notification examples](https://developers.facebook.com/documentation/instagram-platform/webhooks/examples)
