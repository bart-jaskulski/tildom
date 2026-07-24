import { createGoogleGenerativeAI } from "@ai-sdk/google";
import { generateText, tool } from "ai";
import { z } from "zod";

export const tagSuggestionBodySchema = z.object({
  title: z.string().trim().min(1).max(300),
  url: z.string().trim().min(1).max(2048),
  excerpt: z.string().trim().max(2000).nullable().optional(),
  existingTags: z.array(z.string().trim().min(1).max(32)).max(50).default([]),
});

type TagSuggestionRequest = Omit<z.infer<typeof tagSuggestionBodySchema>, "excerpt"> & {
  excerpt: string | null;
};

const tagToolSchema = z.object({
  tags: z.array(z.string()).max(5).describe("Short tag names for this bookmark"),
});

export const suggestTags = async (input: TagSuggestionRequest) => {
  const apiKey = process.env.GOOGLE_API_KEY;
  if (!apiKey) throw new Error("AI tagging is not configured");

  const result = await generateText({
    model: createGoogleGenerativeAI({ apiKey })("gemini-2.5-flash-lite"),
    prompt: `Title: ${input.title}\nURL: ${input.url}\nExcerpt: ${input.excerpt?.trim() || "(none)"}\nExisting tags: ${input.existingTags.join(", ") || "(none)"}`,
    instructions: `You tag personal bookmarks.
Use the setTags tool. Return at most 5 short lowercase slug tags. Prefer existing tags whenever they fit.
Create a new tag only when no existing tag fits. Avoid synonyms or variants of existing tags.
Use only the title, URL, and excerpt.`,
    tools: {
      setTags: tool({
        description: "Set bookmark tags",
        inputSchema: tagToolSchema,
      }),
    },
  });

  const tagCall = result.toolCalls.find((call) => call.toolName === "setTags");
  return tagCall ? tagToolSchema.parse(tagCall.input).tags : [];
};
