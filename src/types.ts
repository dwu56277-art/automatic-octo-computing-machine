export type QueryValue = string | number | boolean | undefined;
export type QueryParams = Record<string, QueryValue>;

export interface ApiOptions {
  /** API root URL; defaults to https://api.goanyapi.com/api/v1. */
  baseUrl?: string;
  /** Inject a Fetch implementation for tests or custom runtimes. */
  fetch?: typeof globalThis.fetch;
  /** Per-request timeout in milliseconds. Defaults to 30 seconds. */
  timeoutMs?: number;
}

export interface CreditBalanceData {
  remainingCredits: number;
}

export interface TrafficData {
  endpoint?: "traffic";
  costCredits?: number;
  remainingCredits?: number;
  query?: { domain?: string; month?: string | number };
  HistoryMonths?: number;
  SiteName?: string;
  Title?: string;
  Description?: string;
  Category?: string;
  TopKeywords?: Array<Record<string, unknown>>;
  TopCountryShares?: Array<Record<string, unknown>>;
  CountryRank?: Record<string, unknown>;
  Engagments?: Record<string, unknown>;
  EstimatedMonthlyVisits?: Record<string, number>;
  GlobalRank?: Record<string, unknown>;
  TrafficSources?: Record<string, number>;
  trafficSourceTrends?: Record<string, Record<string, number>>;
  aiTraffic?: Record<string, unknown>;
  [key: string]: unknown;
}

export type SerpSearchType =
  | "web"
  | "news"
  | "videos"
  | "local"
  | "places"
  | "shopping"
  | "short_videos"
  | "jobs";

export type SerpDevice =
  | "desktop"
  | "mobile"
  | "ios"
  | "iphone"
  | "ipad"
  | "ios_tablet"
  | "android"
  | "android_tablet";

export type SerpBrowser = "chrome" | "safari" | "firefox";

export interface SerpParams extends QueryParams {
  q: string;
  gl?: string;
  hl?: string;
  start?: number;
  device?: SerpDevice;
  browser?: SerpBrowser;
  safe?: "active" | "off";
  search_type?: SerpSearchType;
}

export interface SerpResult {
  general?: Record<string, unknown>;
  input?: Record<string, unknown>;
  navigation?: Array<Record<string, unknown>>;
  organic?: Array<Record<string, unknown>>;
  images?: Array<Record<string, unknown>>;
  pagination?: Record<string, unknown>;
  related?: Array<Record<string, unknown>>;
  [key: string]: unknown;
}

export interface SerpData {
  endpoint?: "serp";
  costCredits?: number;
  remainingCredits?: number;
  query?: Record<string, string>;
  result?: SerpResult;
  [key: string]: unknown;
}

export interface BacklinkData {
  endpoint?: "backlink";
  costCredits?: number;
  remainingCredits?: number;
  query?: { domain?: string };
  domain?: string;
  backlinks?: number;
  dofollowBacklinks?: number;
  dofollowRefdomains?: number;
  domainRating?: number;
  refdomains?: number;
  topBacklinks?: Array<Record<string, unknown>>;
  [key: string]: unknown;
}

export interface KeywordDifficultyData {
  endpoint?: "keyword-difficulty";
  costCredits?: number;
  remainingCredits?: number;
  query?: { keyword?: string; country?: string };
  keyword?: string;
  country?: string;
  difficulty?: number;
  shortage?: number;
  lastUpdate?: string;
  source?: string;
  serp?: Record<string, unknown>;
  [key: string]: unknown;
}

export interface KeywordSuggestionsData {
  endpoint?: "keyword-suggestions";
  costCredits?: number;
  remainingCredits?: number;
  query?: { keyword?: string; page?: string | number };
  page?: number;
  size?: number;
  total?: number;
  totalPages?: number;
  hasNext?: boolean;
  keywords?: string[];
  [key: string]: unknown;
}

export interface KeywordSearchVolumeData {
  endpoint?: "keyword-search-volume";
  costCredits?: number;
  remainingCredits?: number;
  query?: { keyword?: string };
  keyword?: string;
  monthlyVolumes?: Array<{ month: string; volume: number }>;
  [key: string]: unknown;
}

export interface KeywordGeneratorData {
  endpoint?: "keyword-generator";
  costCredits?: number;
  remainingCredits?: number;
  query?: { keyword?: string; country?: string };
  keyword?: string;
  country?: string;
  searchEngine?: string;
  withQuestionIdeas?: boolean;
  allIdeasTotal?: number;
  allIdeas?: Array<Record<string, unknown>>;
  questionIdeasTotal?: number;
  questionIdeas?: Array<Record<string, unknown>>;
  [key: string]: unknown;
}
