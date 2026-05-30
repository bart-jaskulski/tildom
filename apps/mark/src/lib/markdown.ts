import { micromark } from "micromark";
import sanitizeHtml from "sanitize-html";

export const renderMarkdownToHtml = (input: string) => {
  const markdown = input.trim();
  if (!markdown) {
    return "";
  }

  return sanitizeHtml(micromark(markdown), {
    allowedTags: sanitizeHtml.defaults.allowedTags.concat(["h1", "h2", "img"]),
    allowedAttributes: {
      ...sanitizeHtml.defaults.allowedAttributes,
      a: ["href", "name", "target", "rel"],
      img: ["src", "alt", "title"],
    },
    transformTags: {
      a: sanitizeHtml.simpleTransform("a", {
        rel: "noreferrer noopener",
        target: "_blank",
      }),
    },
  });
};
