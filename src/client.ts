import type {
  ApiOptions,
  BacklinkData,
  CreditBalanceData,
  KeywordDifficultyData,
  KeywordGeneratorData,
  KeywordSearchVolumeData,
  KeywordSuggestionsData,
  QueryParams,
  SerpData,
  SerpParams,
  TrafficData,
} from "./types.js";

export const DEFAULT_BASE_URL = "https://api.goanyapi.com/api/v1";

export interface GoAnyApiClientOptions extends ApiOptions {
  apiKey: string;
}

export interface RequestOptions {
  /** Override the default request timeout for this call. */
  timeoutMs?: number;
}

export interface GoAnyApiErrorOptions {
  status?: number | undefined;
  code?: string | undefined;
  details?: unknown;
  retryAfter?: string | null | undefined;
  cause?: unknown;
}

/** An HTTP, API-business, or transport error returned while calling GoAnyAPI. */
export class GoAnyApiError extends Error {
  readonly status: number | undefined;
  readonly code: string | undefined;
  readonly details: unknown;
  readonly retryAfter: string | null | undefined;

  constructor(message: string, options: GoAnyApiErrorOptions = {}) {
    super(message, options.cause === undefined ? undefined : { cause: options.cause });
    this.name = "GoAnyApiError";
    this.status = options.status;
    this.code = options.code;
    this.details = options.details;
    this.retryAfter = options.retryAfter;
  }
}

interface ApiEnvelope<T> {
  code: string;
  message?: string;
  data: T;
  details?: unknown;
}

function isRecord(value: unknown): value is Record<string, unknown> {
  return typeof value === "object" && value !== null && !Array.isArray(value);
}

function assertNonEmpty(name: string, value: string, maxLength?: number): void {
  if (typeof value !== "string" || value.trim().length === 0) {
    throw new TypeError(`${name} must be a non-empty string.`);
  }
  if (maxLength !== undefined && value.length > maxLength) {
    throw new RangeError(`${name} must be at most ${maxLength} characters.`);
  }
}

/**
 * Small, dependency-free GoAnyAPI REST client. It never retries automatically:
 * paid requests should not be repeated invisibly after a transient failure.
 */
export class GoAnyApiClient {
  private readonly apiKey: string;
  private readonly baseUrl: string;
  private readonly fetchImpl: typeof globalThis.fetch;
  private readonly timeoutMs: number;

  constructor(options: GoAnyApiClientOptions) {
    const apiKey = options.apiKey?.trim();
    if (!apiKey) {
      throw new TypeError("A GoAnyAPI API key is required (GOANYAPI_API_KEY).");
    }

    this.apiKey = apiKey;
    this.baseUrl = (options.baseUrl ?? DEFAULT_BASE_URL).replace(/\/+$/, "") + "/";
    try {
      const parsedBaseUrl = new URL(this.baseUrl);
      if (parsedBaseUrl.protocol !== "https:" && parsedBaseUrl.hostname !== "localhost") {
        throw new TypeError("baseUrl must use HTTPS (except for localhost)." );
      }
    } catch (error) {
      if (error instanceof TypeError && error.message.includes("baseUrl")) throw error;
      throw new TypeError("baseUrl must be a valid URL.", { cause: error });
    }

    this.fetchImpl = options.fetch ?? globalThis.fetch;
    if (typeof this.fetchImpl !== "function") {
      throw new TypeError("A Fetch API implementation is required.");
    }

    this.timeoutMs = options.timeoutMs ?? 30_000;
    this.validateTimeout(this.timeoutMs);
  }

  /**
   * Call a documented GoAnyAPI endpoint directly. `endpoint` is relative to
   * `/api/v1` and must not start with `/` (for example, `traffic`).
   */
  async request<T>(
    endpoint: string,
    params: QueryParams = {},
    options: RequestOptions = {},
  ): Promise<T> {
    if (
      !endpoint || endpoint.startsWith("/") || endpoint.includes("?") || endpoint.includes("#") ||
      endpoint.split("/").some((part) => part === "" || part === "." || part === "..")
    ) {
      throw new TypeError("endpoint must be a relative API path such as 'traffic'.");
    }

    const timeoutMs = options.timeoutMs ?? this.timeoutMs;
    this.validateTimeout(timeoutMs);

    const url = new URL(endpoint, this.baseUrl);
    for (const [key, value] of Object.entries(params)) {
      if (value !== undefined) url.searchParams.set(key, String(value));
    }

    let response: Response;
    try {
      response = await this.fetchImpl(url, {
        method: "GET",
        headers: {
          Accept: "application/json",
          Authorization: `Bearer ${this.apiKey}`,
        },
        signal: AbortSignal.timeout(timeoutMs),
      });
    } catch (cause) {
      throw new GoAnyApiError("GoAnyAPI request failed before a response was received.", { cause });
    }

    let payload: unknown;
    try {
      payload = await response.json();
    } catch (cause) {
      throw new GoAnyApiError("GoAnyAPI returned a non-JSON response.", {
        status: response.status,
        retryAfter: response.headers.get("Retry-After"),
        cause,
      });
    }

    const record = isRecord(payload) ? payload : {};
    const code = typeof record.code === "string" ? record.code : undefined;
    const message = typeof record.message === "string" ? record.message : undefined;

    if (!response.ok || code !== "ok" || !("data" in record)) {
      throw new GoAnyApiError(
        message ?? `GoAnyAPI request failed with HTTP ${response.status}.`,
        {
          status: response.status,
          code,
          details: record.details,
          retryAfter: response.headers.get("Retry-After"),
        },
      );
    }

    return (payload as ApiEnvelope<T>).data;
  }

  /** Free endpoint: returns the API key owner's current active credit balance. */
  getCreditBalance(options?: RequestOptions): Promise<CreditBalanceData> {
    return this.request<CreditBalanceData>("credits/balance", {}, options);
  }

  /** Domain traffic overview; current credit cost varies with the selected month range. */
  getTraffic(
    params: { domain: string; month?: 3 | 6 | 12 },
    options?: RequestOptions,
  ): Promise<TrafficData> {
    assertNonEmpty("domain", params.domain);
    if (params.month !== undefined && ![3, 6, 12].includes(params.month)) {
      throw new RangeError("month must be 3, 6, or 12.");
    }
    return this.request<TrafficData>("traffic", params, options);
  }

  /** Google SERP results. Successful requests currently cost credits. */
  getSerp(params: SerpParams, options?: RequestOptions): Promise<SerpData> {
    assertNonEmpty("q", params.q, 200);
    if (params.start !== undefined && (!Number.isInteger(params.start) || params.start < 0 || params.start > 990)) {
      throw new RangeError("start must be an integer from 0 to 990.");
    }
    return this.request<SerpData>("serp", params, options);
  }

  /** Domain backlink summary and top backlink records. */
  getBacklinks(params: { domain: string }, options?: RequestOptions): Promise<BacklinkData> {
    assertNonEmpty("domain", params.domain);
    return this.request<BacklinkData>("backlink", params, options);
  }

  /** Keyword difficulty score plus normalized SERP details. */
  getKeywordDifficulty(
    params: { keyword: string; country?: string },
    options?: RequestOptions,
  ): Promise<KeywordDifficultyData> {
    assertNonEmpty("keyword", params.keyword, 200);
    return this.request<KeywordDifficultyData>("keyword-difficulty", params, options);
  }

  /** Paginated suggestions; use an exact returned value with getKeywordSearchVolume. */
  getKeywordSuggestions(
    params: { keyword: string; page?: number },
    options?: RequestOptions,
  ): Promise<KeywordSuggestionsData> {
    assertNonEmpty("keyword", params.keyword, 200);
    if (params.page !== undefined && (!Number.isInteger(params.page) || params.page < 0 || params.page > 100_000)) {
      throw new RangeError("page must be an integer from 0 to 100000.");
    }
    return this.request<KeywordSuggestionsData>("keyword-suggestions", params, options);
  }

  /** Search volume history for an exact keyword returned by the suggestions API. */
  getKeywordSearchVolume(
    params: { keyword: string },
    options?: RequestOptions,
  ): Promise<KeywordSearchVolumeData> {
    assertNonEmpty("keyword", params.keyword, 200);
    return this.request<KeywordSearchVolumeData>("keyword-search-volume", params, options);
  }

  /** Generate related and question-style ideas from a seed keyword. */
  generateKeywords(
    params: { keyword: string; country?: string },
    options?: RequestOptions,
  ): Promise<KeywordGeneratorData> {
    assertNonEmpty("keyword", params.keyword, 200);
    return this.request<KeywordGeneratorData>("keyword-generator", params, options);
  }

  private validateTimeout(timeoutMs: number): void {
    if (!Number.isInteger(timeoutMs) || timeoutMs < 1 || timeoutMs > 600_000) {
      throw new RangeError("timeoutMs must be an integer from 1 to 600000.");
    }
  }
}
