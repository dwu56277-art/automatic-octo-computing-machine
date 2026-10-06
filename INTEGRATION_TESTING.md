# GoAnyAPI Live Integration Tests

This script calls the real GoAnyAPI service and validates the client methods against live responses. It is separate from `npm test`, which remains fully offline.

## Safety and credit usage

- The preflight and postflight `credits/balance` calls are free according to GoAnyAPI's docs.
- Traffic, SERP, backlink, and keyword tests may consume credits. The current rates are controlled by GoAnyAPI and can change; check the [official API docs](https://goanyapi.com/docs) and your balance first.
- The script refuses to call any API without `GOANYAPI_API_KEY`.
- It also refuses to run paid checks unless `--confirm-paid` is present. Do not use this flag unless you accept the credit usage.
- `--free-only` checks credentials and the free balance endpoint without calling paid endpoints.
- The script uses one request per endpoint, no automatic retries, and queries volume only for an exact keyword returned by the suggestions API.

## Run all supported API checks

Use a real key from your local secret store or shell environment. Do not commit a key or place it in repository files.

```bash
export GOANYAPI_API_KEY="your_real_key"
export GOANYAPI_TEST_DOMAIN="your-domain.com"
export GOANYAPI_TEST_QUERY="your search query"
export GOANYAPI_TEST_KEYWORD="your seed keyword"
npm run test:integration -- --confirm-paid
```

`GOANYAPI_TEST_DOMAIN` defaults to `example.com`; the query and seed keyword default to `seo`. Use a domain and keyword likely to have available data for a meaningful live test.

To verify only authentication and the free credit endpoint:

```bash
npm run test:integration -- --free-only
```

Optionally prevent paid tests when the available balance is below a threshold:

```bash
export GOANYAPI_MIN_CREDITS=20
npm run test:integration -- --confirm-paid
```

The threshold is a user-selected preflight floor, not a cost estimate or guarantee. API call costs can vary.

## What is checked

The live script checks:

1. Credit balance before tests.
2. Traffic response shape.
3. Google SERP response shape.
4. Backlink metrics.
5. Keyword difficulty score.
6. Keyword suggestions.
7. Keyword search volume using one exact suggestion from step 6 (skipped if no suggestion is returned).
8. Keyword generator's related and question ideas.
9. Credit balance after tests.

A nonzero exit code indicates a missing key/consent, failed preflight, invalid response, API error, or failed postflight. The output reports endpoint, HTTP/API error code and message, and the `Retry-After` value when present; it does not print the API key.
