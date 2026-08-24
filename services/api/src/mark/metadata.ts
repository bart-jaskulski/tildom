import { lookup } from "node:dns/promises";
import { isIP } from "node:net";
import { Readability } from "@mozilla/readability";
import { JSDOM } from "jsdom";
import TurndownService from "turndown";

export type PageMetadata = {
  title: string | null;
  excerpt: string | null;
  capture: PageCapture | null;
};

export type PageCapture = {
  markdown: string;
  textContent: string;
  byline: string | null;
  siteName: string | null;
  publishedAt: string | null;
  language: string | null;
  sourceUrl: string;
};

const MAX_HTML_BYTES = 2_000_000;
const FETCH_TIMEOUT_MS = 7_000;
const MAX_REDIRECTS = 5;

const isPrivateIp = (address: string) => {
  const normalized = address.toLowerCase().replace(/^::ffff:/, "");
  if (isIP(normalized) === 4) {
    const [a, b] = normalized.split(".").map(Number);
    return a === 0
      || a === 10
      || a === 127
      || (a === 169 && b === 254)
      || (a === 172 && b >= 16 && b <= 31)
      || (a === 192 && b === 168)
      || a >= 224;
  }
  return normalized === "::"
    || normalized === "::1"
    || normalized.startsWith("fc")
    || normalized.startsWith("fd")
    || normalized.startsWith("ff")
    || /^fe[89ab]/.test(normalized);
};

const assertPublicUrl = async (
  url: URL,
  resolve: typeof lookup,
) => {
  if (!["http:", "https:"].includes(url.protocol)) {
    throw new Error("Only http and https URLs are supported");
  }
  if (url.username || url.password) throw new Error("URL credentials are not supported");
  if (url.hostname === "localhost" || url.hostname.endsWith(".localhost")) {
    throw new Error("Private network URLs are not supported");
  }

  const addresses = isIP(url.hostname)
    ? [{ address: url.hostname, family: isIP(url.hostname) }]
    : await resolve(url.hostname, { all: true });
  if (!addresses.length || addresses.some(({ address }) => isPrivateIp(address))) {
    throw new Error("Private network URLs are not supported");
  }
};

const decodeHtmlEntities = (value: string) =>
  value.replace(/&(#x[0-9a-f]+|#\d+|amp|lt|gt|quot|apos|nbsp);/gi, (match, entity: string) => {
    const normalizedEntity = entity.toLowerCase();
    if (normalizedEntity.startsWith("#x")) {
      return String.fromCodePoint(Number.parseInt(normalizedEntity.slice(2), 16));
    }
    if (normalizedEntity.startsWith("#")) {
      return String.fromCodePoint(Number.parseInt(normalizedEntity.slice(1), 10));
    }
    return {
      amp: "&",
      apos: "'",
      gt: ">",
      lt: "<",
      nbsp: " ",
      quot: "\"",
    }[normalizedEntity] ?? match;
  });

const normalizeMetadataText = (value: string | null | undefined) => {
  if (!value) return null;
  return decodeHtmlEntities(value).replace(/<[^>]*>/g, " ").replace(/\s+/g, " ").trim() || null;
};

const readResponseHtml = async (response: Response) => {
  const reader = response.body?.getReader();
  if (!reader) return response.text();

  const chunks: Uint8Array[] = [];
  let bytesRead = 0;
  while (bytesRead < MAX_HTML_BYTES) {
    const { done, value } = await reader.read();
    if (done) break;
    chunks.push(value);
    bytesRead += value.byteLength;
  }
  await reader.cancel();
  return new TextDecoder().decode(Buffer.concat(chunks, Math.min(bytesRead, MAX_HTML_BYTES)));
};

const readAttributes = (tag: string) => {
  const attributes = new Map<string, string>();
  const pattern = /([^\s"'=<>`]+)\s*=\s*(?:"([^"]*)"|'([^']*)'|([^\s"'=<>`]+))/g;
  let match: RegExpExecArray | null;
  while ((match = pattern.exec(tag))) {
    attributes.set(match[1].toLowerCase(), match[2] ?? match[3] ?? match[4] ?? "");
  }
  return attributes;
};

const findMetaContent = (html: string, names: string[]) => {
  const wanted = new Set(names.map((name) => name.toLowerCase()));
  const pattern = /<meta\b[^>]*>/gi;
  let match: RegExpExecArray | null;
  while ((match = pattern.exec(html))) {
    const attributes = readAttributes(match[0]);
    const name = attributes.get("property") ?? attributes.get("name") ?? attributes.get("itemprop");
    if (name && wanted.has(name.toLowerCase())) {
      return normalizeMetadataText(attributes.get("content") ?? null);
    }
  }
  return null;
};

const markdown = new TurndownService({
  headingStyle: "atx",
  bulletListMarker: "-",
  codeBlockStyle: "fenced",
  emDelimiter: "*",
  strongDelimiter: "**",
});

const TRACKING_QUERY_PARAM = /^(?:utm_|fbclid$|gclid$|dclid$|msclkid$|_ga$|_gl$|mc_(?:cid|eid)$|igshid$)/i;

const normalizeReaderLink = (value: string, sourceUrl: string) => {
  try {
    const url = new URL(value, sourceUrl);
    if (url.protocol !== "http:" && url.protocol !== "https:") return value;
    for (const name of [...url.searchParams.keys()]) {
      if (TRACKING_QUERY_PARAM.test(name)) url.searchParams.delete(name);
    }
    return url.toString();
  } catch {
    return null;
  }
};

const prepareReaderContent = (content: string, sourceUrl: string) => {
  const document = new JSDOM(`<body>${content}</body>`, { url: sourceUrl }).window.document;
  document.querySelectorAll("img, picture, source").forEach((element) => element.remove());
  document.querySelectorAll("a").forEach((anchor) => {
    if (!anchor.textContent?.trim() && anchor.children.length === 0) anchor.remove();
  });
  document.querySelectorAll("a[href]").forEach((anchor) => {
    const href = normalizeReaderLink(anchor.getAttribute("href")!, sourceUrl);
    if (href) anchor.setAttribute("href", href);
    else anchor.removeAttribute("href");
  });
  return document.body.innerHTML;
};

export const parsePageMetadata = (html: string, sourceUrl = "https://example.com"): PageMetadata => {
  const fallback = {
    title: findMetaContent(html, ["og:title", "twitter:title"])
      ?? normalizeMetadataText(/<title\b[^>]*>([\s\S]*?)<\/title>/i.exec(html)?.[1] ?? null),
    excerpt: findMetaContent(html, ["og:description", "description", "twitter:description"]),
  };
  const document = new JSDOM(html, { url: sourceUrl }).window.document;
  const article = new Readability(document).parse();
  const textContent = article?.textContent?.trim();
  if (!article || !textContent) return { ...fallback, capture: null };

  return {
    title: normalizeMetadataText(article.title) ?? fallback.title,
    excerpt: normalizeMetadataText(article.excerpt) ?? fallback.excerpt,
    capture: {
      markdown: markdown.turndown(prepareReaderContent(article.content ?? "", sourceUrl)).trim(),
      textContent,
      byline: normalizeMetadataText(article.byline),
      siteName: normalizeMetadataText(article.siteName),
      publishedAt: normalizeMetadataText(article.publishedTime),
      language: normalizeMetadataText(article.lang),
      sourceUrl,
    },
  };
};

export const fetchPageMetadata = async (
  urlInput: string,
  resolve: typeof lookup = lookup,
): Promise<PageMetadata> => {
  let url = new URL(urlInput);
  let response: Response | undefined;

  for (let redirects = 0; redirects <= MAX_REDIRECTS; redirects += 1) {
    await assertPublicUrl(url, resolve);
    response = await fetch(url, {
      headers: {
        Accept: "text/html,application/xhtml+xml",
        "User-Agent": "api.tildom metadata fetcher",
      },
      redirect: "manual",
      signal: AbortSignal.timeout(FETCH_TIMEOUT_MS),
    });
    if (response.status < 300 || response.status >= 400) break;

    const location = response.headers.get("location");
    await response.body?.cancel();
    if (!location) throw new Error("Metadata redirect did not include a location");
    if (redirects === MAX_REDIRECTS) throw new Error("Metadata fetch followed too many redirects");
    url = new URL(location, url);
  }

  if (!response) throw new Error("Metadata fetch failed");
  if (!response.ok) throw new Error(`Metadata fetch failed with status ${response.status}`);

  const contentType = response.headers.get("content-type") ?? "";
  if (contentType && !/\b(?:text\/html|application\/xhtml\+xml)\b/i.test(contentType)) {
    throw new Error("URL did not return HTML");
  }
  return parsePageMetadata(await readResponseHtml(response), url.toString());
};
