export type LinkMetadata = {
  title: string | null;
  excerpt: string | null;
  capture: ExtractedCapture | null;
};

export type ExtractedCapture = {
  markdown: string;
  textContent: string;
  byline: string | null;
  siteName: string | null;
  publishedAt: string | null;
  language: string | null;
  sourceUrl: string | null;
};

const API_BASE_URL = import.meta.env.VITE_API_BASE_URL
  || (import.meta.env.DEV ? "http://localhost:8788" : "https://api.tildom.app");

const normalizeMetadataValue = (value: unknown) => {
  if (typeof value !== "string") {
    return null;
  }

  const normalized = value.replace(/\s+/g, " ").trim();
  return normalized || null;
};

export const fetchLinkMetadata = async (url: string): Promise<LinkMetadata> => {
  try {
    const response = await fetch(`${API_BASE_URL}/v1/mark/metadata`, {
      method: "POST",
      headers: {
        Accept: "application/json",
        "Content-Type": "application/json",
      },
      body: JSON.stringify({ url }),
    });

    if (!response.ok) {
      return { title: null, excerpt: null, capture: null };
    }

    const data = await response.json() as Partial<LinkMetadata>;
    const capture = data.capture;

    return {
      title: normalizeMetadataValue(data.title),
      excerpt: normalizeMetadataValue(data.excerpt),
      capture: capture && typeof capture === "object"
        && typeof capture.markdown === "string"
        && typeof capture.textContent === "string"
        ? {
          markdown: capture.markdown,
          textContent: capture.textContent,
          byline: normalizeMetadataValue(capture.byline),
          siteName: normalizeMetadataValue(capture.siteName),
          publishedAt: normalizeMetadataValue(capture.publishedAt),
          language: normalizeMetadataValue(capture.language),
          sourceUrl: normalizeMetadataValue(capture.sourceUrl),
        }
        : null,
    };
  } catch {
    return { title: null, excerpt: null, capture: null };
  }
};
