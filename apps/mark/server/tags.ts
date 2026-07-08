import { createGoogleGenerativeAI } from "@ai-sdk/google";
import { generateText, tool } from "ai";
import { z } from "zod";

export type TagSuggestionRequest = {
  title: string;
  url: string;
  excerpt: string | null;
  existingTags: string[];
};

const tagToolSchema = z.object({
  tags: z.array(z.string()).max(5).describe("Short tag names for this bookmark"),
});

export const tagSuggestionBodySchema = z.object({
  title: z.string().trim().min(1).max(300),
  url: z.string().trim().min(1).max(2048),
  excerpt: z.string().trim().max(2000).nullable().optional(),
  existingTags: z.array(z.string().trim().min(1).max(32)).max(50).default([]),
});

export const suggestTags = async (input: TagSuggestionRequest) => {
  const apiKey = process.env.GOOGLE_API_KEY;
  if (!apiKey) {
    throw new Error("AI tagging is not configured");
  }

  const google = createGoogleGenerativeAI({ apiKey });
  const existingTags = input.existingTags.length ? input.existingTags.join(", ") : "(none)";
  const excerpt = input.excerpt?.trim() || "(none)";

  const result = await generateText({
    model: google("gemini-2.5-flash-lite"),
    prompt: `Title: ${input.title}\nURL: ${input.url}\nExcerpt: ${excerpt}\nExisting tags: ${existingTags}`,
    system: `
You tag personal bookmarks.

Rules:
1. Use the setTags tool.
2. Return at most 5 tags.
3. Prefer existing tags whenever they fit.
4. Create a new tag only when no existing tag fits.
5. Avoid synonyms or variants of existing tags.
6. Tags must be short lowercase slugs.
7. Use only the title, URL, and excerpt.
`,
    tools: {
      setTags: tool({
        description: "Set bookmark tags",
        inputSchema: tagToolSchema,
      }),
    },
  });

  const tagCall = [...result.toolCalls].reverse().find((call: any) => !call.dynamic && call.toolName === "setTags");
  return tagCall ? tagToolSchema.parse(tagCall.input).tags : [];
};
