export type LinkMetadata = {
  title: string | null;
  excerpt: string | null;
};

const normalizeMetadataValue = (value: unknown) => {
  if (typeof value !== "string") {
    return null;
  }

  const normalized = value.replace(/\s+/g, " ").trim();
  return normalized || null;
};

export const fetchLinkMetadata = async (url: string): Promise<LinkMetadata> => {
  try {
    const response = await fetch("/api/metadata", {
      method: "POST",
      headers: {
        Accept: "application/json",
        "Content-Type": "application/json",
      },
      body: JSON.stringify({ url }),
    });

    if (!response.ok) {
      return { title: null, excerpt: null };
    }

    const data = await response.json() as Partial<LinkMetadata>;

    return {
      title: normalizeMetadataValue(data.title),
      excerpt: normalizeMetadataValue(data.excerpt),
    };
  } catch {
    return { title: null, excerpt: null };
  }
};
