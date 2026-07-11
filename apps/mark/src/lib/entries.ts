export type ExcerptStatus = "idle" | "pending" | "ready" | "error";

export type Entry = {
  id: string;
  sourceUrl: string | null;
  canonicalUrl: string | null;
  domain: string | null;
  title: string;
  body: string;
  excerpt: string | null;
  excerptStatus: ExcerptStatus;
  excerptError: string | null;
  createdAt: number;
  updatedAt: number;
  lastCommentedAt: number | null;
  commentCount: number;
  tags: string[];
};

export type EntryComment = {
  id: string;
  entryId: string;
  body: string;
  createdAt: number;
  updatedAt: number;
};

export type EntryDetail = {
  entry: Entry | null;
  comments: EntryComment[];
};

export type SearchResult = Entry & {
  score: number;
  matchText: string;
};

export type NormalizedUrl = {
  sourceUrl: string;
  canonicalUrl: string;
  domain: string;
};

const URL_SCHEME_PATTERN = /^[a-z][a-z0-9+.-]*:\/\//i;
const URL_PROTOCOL_PATTERN = /^[a-z][a-z0-9+.-]*:/i;
const URL_ONLY_PATTERN = /^(?:https?:\/\/)?(?:www\.)?[a-z0-9](?:[a-z0-9-]{0,61}[a-z0-9])?(?:\.[a-z0-9](?:[a-z0-9-]{0,61}[a-z0-9])?)+(?:\:\d{1,5})?(?:[/?#][^\s]*)?$/i;
const NOTE_TITLE_FALLBACK = "Untitled note";
const TRACKING_QUERY_PARAM = /^(?:utm_|fbclid$|gclid$|dclid$|msclkid$|_ga$|_gl$|mc_(?:cid|eid)$|igshid$)/i;

const trimTrailingSlash = (pathname: string) => {
  if (pathname === "/") {
    return pathname;
  }

  return pathname.endsWith("/") ? pathname.slice(0, -1) : pathname;
};

export const normalizeDomain = (hostname: string) => hostname.trim().toLowerCase().replace(/^www\./, "");

export const normalizeUrlInput = (input: string): NormalizedUrl => {
  const inputUrl = input.trim();
  if (!inputUrl) {
    throw new Error("URL is required");
  }

  const candidate = URL_SCHEME_PATTERN.test(inputUrl) || URL_PROTOCOL_PATTERN.test(inputUrl)
    ? inputUrl
    : `https://${inputUrl}`;
  const url = new URL(candidate);

  if (url.protocol !== "http:" && url.protocol !== "https:") {
    throw new Error("Only http and https URLs are supported");
  }

  url.hash = "";
  for (const name of [...url.searchParams.keys()]) {
    if (TRACKING_QUERY_PARAM.test(name)) {
      url.searchParams.delete(name);
    }
  }

  if ((url.protocol === "http:" && url.port === "80") || (url.protocol === "https:" && url.port === "443")) {
    url.port = "";
  }

  url.pathname = trimTrailingSlash(url.pathname);
  const canonicalUrl = url.toString();

  return {
    sourceUrl: canonicalUrl,
    canonicalUrl,
    domain: normalizeDomain(url.hostname),
  };
};

export const isUrlOnlyInput = (input: string) => URL_ONLY_PATTERN.test(input.trim());

export const hasEntryLink = (entry: Pick<Entry, "sourceUrl" | "canonicalUrl">) =>
  Boolean(entry.sourceUrl || entry.canonicalUrl);

export const splitNoteIntoTitleAndBody = (input: string) => {
  const normalized = input.replace(/\r\n?/g, "\n").trim();
  if (!normalized) {
    return { title: NOTE_TITLE_FALLBACK, body: "" };
  }

  const firstLineBreak = normalized.indexOf("\n");
  if (firstLineBreak === -1) {
    return { title: normalized, body: "" };
  }

  const title = normalized.slice(0, firstLineBreak).trim() || NOTE_TITLE_FALLBACK;
  const body = normalized.slice(firstLineBreak + 1);
  return { title, body };
};

export const deriveNoteTitle = (body: string) => {
  return splitNoteIntoTitleAndBody(body).title;
};

export const buildUrlFallbackTitle = (normalizedUrl: NormalizedUrl) => normalizedUrl.domain || normalizedUrl.canonicalUrl;

export const formatRelativeTimestamp = (timestamp: number) => {
  const diffMs = Date.now() - timestamp;
  const diffMinutes = Math.max(1, Math.floor(diffMs / 60_000));

  if (diffMinutes < 60) {
    return `${diffMinutes}m ago`;
  }

  const diffHours = Math.floor(diffMinutes / 60);
  if (diffHours < 24) {
    return `${diffHours}h ago`;
  }

  const diffDays = Math.floor(diffHours / 24);
  if (diffDays < 30) {
    return `${diffDays}d ago`;
  }

  return new Date(timestamp).toLocaleDateString();
};

export const createRecordId = () => crypto.randomUUID();
