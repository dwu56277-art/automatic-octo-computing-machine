# GoAnyAPI TypeScript Client

A small, dependency-free TypeScript client for the [GoAnyAPI](https://goanyapi.com/) REST API. It uses the official API host, Bearer-token authentication, typed convenience methods, request timeouts, and structured API errors.

## Requirements

- Node.js 18 or newer (built-in Fetch API)
- A GoAnyAPI API key with available credits for paid endpoints

## Install and build

```bash
npm install
npm run build
npm test
```

## Configure the API key

Copy `.env.example` to `.env` and replace the placeholder locally:

```dotenv
GOANYAPI_API_KEY=your_real_key
```

The `.env` file is ignored by Git. **Never commit or paste your real API key into source code, issues, or chat.** This library intentionally does not load `.env` files; pass the key from your runtime's secret/environment configuration:

```ts
import { GoAnyApiClient } from "goanyapi-typescript-client";

const client = new GoAnyApiClient({
  apiKey: process.env.GOANYAPI_API_KEY!,
});
```

For a local script without a dotenv loader, export the variable in the shell before starting the app:

```bash
export GOANYAPI_API_KEY="your_real_key"
```

## Examples

```ts
import { GoAnyApiClient, GoAnyApiError } from "goanyapi-typescript-client";

const client = new GoAnyApiClient({
  apiKey: process.env.GOANYAPI_API_KEY!,
  timeoutMs: 30_000,
});

try {
  // Free; does not consume credits.
  const balance = await client.getCreditBalance();
  console.log("Credits:", balance.remainingCredits);

  // Traffic: month may be 3, 6, or 12.
  const traffic = await client.getTraffic({ domain: "example.com", month: 3 });

  // Localized Google results.
  const serp = await client.getSerp({
    q: "site analytics",
    gl: "us",
    hl: "en",
    search_type: "web",
    device: "desktop",
  });

  // Backlink metrics.
  const backlinks = await client.getBacklinks({ domain: "example.com" });

  // Keyword research.
  const difficulty = await client.getKeywordDifficulty({ keyword: "site analytics", country: "us" });
  const ideas = await client.generateKeywords({ keyword: "site analytics", country: "us" });

  // Follow the documented suggestions -> exact search-volume workflow.
  const suggestions = await client.getKeywordSuggestions({ keyword: "site analytics", page: 0 });
  const exactKeyword = suggestions.keywords?.[0];
  if (exactKeyword) {
    const volume = await client.getKeywordSearchVolume({ keyword: exactKeyword });
    console.log(volume.monthlyVolumes);
  }

  console.log({ traffic, serp, backlinks, difficulty, ideas });
} catch (error) {
  if (error instanceof GoAnyApiError) {
    console.error("GoAnyAPI error:", {
      status: error.status,
      code: error.code,
      message: error.message,
      retryAfter: error.retryAfter,
    });
  }
  throw error;
}
```

The client also offers `request<T>(endpoint, params)` for other documented GoAnyAPI endpoints. Paths are relative to `/api/v1`, e.g. `client.request<MyData>("dr", { domain: "example.com" })`.

## Supported convenience methods

| Method | Endpoint | Notes |
| --- | --- | --- |
| `getCreditBalance()` | `GET /credits/balance` | Free endpoint |
| `getTraffic({ domain, month? })` | `GET /traffic` | `month`: 3, 6, or 12 |
| `getSerp({ q, ... })` | `GET /serp` | Supports locale, pagination, device, browser and search type |
| `getBacklinks({ domain })` | `GET /backlink` | Backlink summary and top backlinks |
| `getKeywordDifficulty({ keyword, country? })` | `GET /keyword-difficulty` | Difficulty and normalized SERP data |
| `generateKeywords({ keyword, country? })` | `GET /keyword-generator` | Related and question ideas |
| `getKeywordSuggestions({ keyword, page? })` | `GET /keyword-suggestions` | Paginated suggestion strings |
| `getKeywordSearchVolume({ keyword })` | `GET /keyword-search-volume` | Use an exact suggestion returned by the suggestions endpoint |

All paid API calls may consume GoAnyAPI credits. Credit prices are controlled by GoAnyAPI and can vary; check the live [API docs](https://goanyapi.com/docs) and your credit balance before running paid requests. The client does not automatically retry failed calls, to avoid unexpected repeated credit use. A 429 error exposes the `Retry-After` header as `error.retryAfter`.

## Error handling

`GoAnyApiError` exposes `status`, `code`, `details`, and `retryAfter`. Common GoAnyAPI errors include `missing_api_key`, `invalid_api_key`, `insufficient_credits`, `rate_limit_exceeded`, and `invalid_params`.

## Official references

- [API documentation](https://goanyapi.com/docs)
- [Traffic API](https://goanyapi.com/docs/traffic-api)
- [SERP API](https://goanyapi.com/docs/serp-api)
- [Backlinks API](https://goanyapi.com/docs/backlink-api)
- [Keyword APIs](https://goanyapi.com/docs/keyword-difficulty-api)


## Live integration tests

To test the actual GoAnyAPI service, configure `GOANYAPI_API_KEY` and run `npm run test:integration -- --confirm-paid`. Live checks may consume credits; without `--confirm-paid`, the script sends no requests. Use `--free-only` to verify the key and free credit-balance endpoint only. See [INTEGRATION_TESTING.md](./INTEGRATION_TESTING.md) for details.
