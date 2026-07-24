export type TagSuggestionInput = {
  title: string;
  url: string;
  excerpt: string | null;
  existingTags: string[];
};

const API_BASE_URL = import.meta.env.VITE_API_BASE_URL
  || (import.meta.env.DEV ? "http://localhost:8788" : "https://api.tildom.app");

export const fetchSuggestedTags = async (input: TagSuggestionInput) => {
  try {
    const response = await fetch(`${API_BASE_URL}/v1/mark/tags`, {
      method: "POST",
      headers: {
        Accept: "application/json",
        "Content-Type": "application/json",
      },
      body: JSON.stringify(input),
    });

    if (!response.ok) {
      return [];
    }

    const data = await response.json() as { tags?: unknown };
    return Array.isArray(data.tags) ? data.tags.filter((tag): tag is string => typeof tag === "string") : [];
  } catch {
    return [];
  }
};
