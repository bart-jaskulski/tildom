export const MAX_TAGS_PER_ENTRY = 5;
export const MAX_USED_TAGS = 50;
export const MAX_TAG_LENGTH = 32;

export const normalizeTagName = (input: string) => {
  const normalized = input
    .trim()
    .replace(/^#+/, "")
    .toLowerCase()
    .replace(/[_\s]+/g, "-")
    .replace(/[^a-z0-9-]/g, "")
    .replace(/-+/g, "-")
    .replace(/^-|-$/g, "");

  if (!normalized || normalized.length > MAX_TAG_LENGTH) {
    return null;
  }

  return normalized;
};

export const normalizeTagList = (values: string[]) => {
  const seen = new Set<string>();
  const tags: string[] = [];

  for (const value of values) {
    const tag = normalizeTagName(value);
    if (!tag || seen.has(tag)) {
      continue;
    }

    seen.add(tag);
    tags.push(tag);
  }

  return tags;
};

export const parseTagInput = (input: string) => normalizeTagList(input.split(/[,\s]+/));

export const parseHashTags = (input: string) => {
  // Strip code blocks, inline code, markdown link destinations, and HTML tags
  const sanitized = input
    .replace(/```[\s\S]*?```/g, "")
    .replace(/`[^`\n]+`/g, "")
    .replace(/\[([^\]\n]*)\]\([^)\n]*\)/g, "$1")
    .replace(/<[^>\n]+>/g, "");

  const matches = sanitized.matchAll(/(?:^|[^\w/])#([a-z][a-z0-9_-]*)/gi);
  return normalizeTagList(Array.from(matches, (match) => match[1]));
};

export const stripTrailingTagLines = (input: string) => input
  .replace(/(?:^|\n)(?:\s*#[a-z0-9_-]+(?:\s+#[a-z0-9_-]+)*)+\s*$/i, "")
  .trim();
