export type PageMetadata = {
  title: string | null;
  excerpt: string | null;
};

const MAX_HTML_BYTES = 2_000_000;
const FETCH_TIMEOUT_MS = 7_000;

const normalizeMetadataText = (value: string | null) => {
  if (!value) {
    return null;
  }

  const normalized = decodeHtmlEntities(value)
    .replace(/<[^>]*>/g, " ")
    .replace(/\s+/g, " ")
    .trim();

  return normalized || null;
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

    const namedEntities: Record<string, string> = {
      amp: "&",
      apos: "'",
      gt: ">",
      lt: "<",
      nbsp: " ",
      quot: "\"",
    };

    return namedEntities[normalizedEntity] ?? match;
  });

const readResponseHtml = async (response: Response) => {
  const reader = response.body?.getReader();
  if (!reader) {
    return response.text();
  }

  const chunks: Uint8Array[] = [];
  let bytesRead = 0;

  while (bytesRead < MAX_HTML_BYTES) {
    const { done, value } = await reader.read();
    if (done) {
      break;
    }

    chunks.push(value);
    bytesRead += value.byteLength;
  }

  await reader.cancel();
  return new TextDecoder().decode(Buffer.concat(chunks, Math.min(bytesRead, MAX_HTML_BYTES)));
};

const readAttributes = (tag: string) => {
  const attributes = new Map<string, string>();
  const attributePattern = /([^\s"'=<>`]+)\s*=\s*(?:"([^"]*)"|'([^']*)'|([^\s"'=<>`]+))/g;
  let match: RegExpExecArray | null;

  while ((match = attributePattern.exec(tag))) {
    attributes.set(match[1].toLowerCase(), match[2] ?? match[3] ?? match[4] ?? "");
  }

  return attributes;
};

const findMetaContent = (html: string, names: string[]) => {
  const wantedNames = new Set(names.map((name) => name.toLowerCase()));
  const metaPattern = /<meta\b[^>]*>/gi;
  let match: RegExpExecArray | null;

  while ((match = metaPattern.exec(html))) {
    const attributes = readAttributes(match[0]);
    const name = attributes.get("property") ?? attributes.get("name") ?? attributes.get("itemprop");

    if (name && wantedNames.has(name.toLowerCase())) {
      return normalizeMetadataText(attributes.get("content") ?? null);
    }
  }

  return null;
};

const findDocumentTitle = (html: string) => {
  const match = /<title\b[^>]*>([\s\S]*?)<\/title>/i.exec(html);
  return normalizeMetadataText(match?.[1] ?? null);
};

export const parsePageMetadata = (html: string): PageMetadata => ({
  title: findMetaContent(html, ["og:title", "twitter:title"]) ?? findDocumentTitle(html),
  excerpt: findMetaContent(html, ["og:description", "description", "twitter:description"]),
});

export const fetchPageMetadata = async (urlInput: string): Promise<PageMetadata> => {
  const url = new URL(urlInput);

  if (url.protocol !== "http:" && url.protocol !== "https:") {
    throw new Error("Only http and https URLs are supported");
  }

  const response = await fetch(url, {
    headers: {
      "Accept": "text/html,application/xhtml+xml",
      "User-Agent": "mark.tildom metadata fetcher",
    },
    signal: AbortSignal.timeout(FETCH_TIMEOUT_MS),
  });

  if (!response.ok) {
    throw new Error(`Metadata fetch failed with status ${response.status}`);
  }

  const contentType = response.headers.get("content-type") ?? "";
  if (contentType && !/\b(?:text\/html|application\/xhtml\+xml)\b/i.test(contentType)) {
    throw new Error("URL did not return HTML");
  }

  return parsePageMetadata(await readResponseHtml(response));
};
