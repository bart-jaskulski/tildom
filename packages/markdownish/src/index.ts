import { micromark } from "micromark";
import { gfm, gfmHtml } from "micromark-extension-gfm";
import remend from "remend";
import sanitizeHtml from "sanitize-html";

type RenderMarkdownishOptions = {
  compactLinks?: boolean;
  hashtagHref?: string;
  hashtags?: boolean;
  streaming?: boolean;
  tasks?: boolean;
};

export const renderMarkdownishToHtml = (
  input: string,
  options: RenderMarkdownishOptions = {},
) => {
  const markdown = options.streaming
    ? remend(input.trim(), { linkMode: "text-only" })
    : input.trim();
  if (!markdown) return "";

  let taskIndex = 0;
  const linkAttributes = {
    ...(options.compactLinks ? { class: "markdownish-link-compact" } : {}),
    rel: "noreferrer noopener",
    target: "_blank",
  };
  const html = micromark(markdown, {
    extensions: [gfm()],
    htmlExtensions: [gfmHtml()],
  }).replace(
    /<input type="checkbox" disabled=""( checked="")? \/>/g,
    (_, checked: string | undefined) => {
      const isChecked = Boolean(checked);
      const tag = options.tasks ? "button" : "span";
      return `<${tag} class="markdownish-task" data-markdownish-task="${taskIndex++}"${options.tasks ? ` type="button" aria-label="${isChecked ? "Mark task incomplete" : "Mark task complete"}" aria-pressed="${isChecked}"` : ""}>[${isChecked ? "x" : " "}]</${tag}>`;
    },
  );

  return sanitizeHtml(html, {
    allowedTags: sanitizeHtml.defaults.allowedTags.concat(["button", "h1", "h2", "img", "span"]),
    allowedAttributes: {
      ...sanitizeHtml.defaults.allowedAttributes,
      a: ["class", "href", "name", "target", "rel"],
      button: ["aria-label", "aria-pressed", "class", "data-markdownish-task", "type"],
      img: ["src", "alt", "title"],
      span: ["class", "data-markdownish-task"],
    },
    transformTags: {
      a: sanitizeHtml.simpleTransform("a", linkAttributes),
    },
    textFilter: options.hashtags
      ? (text, tagName) => {
          if (tagName === "a" || tagName === "code" || tagName === "pre") return text;
          return text.replace(/(^|[^\w])#([a-zA-Z0-9_-]+)/g, (_, prefix: string, tag: string) => (
            options.hashtagHref
              ? `${prefix}<a class="markdownish-tag" href="${options.hashtagHref}${encodeURIComponent(tag)}">#${tag}</a>`
              : `${prefix}<button type="button" class="markdownish-tag" data-markdownish-tag="${tag}">#${tag}</button>`
          ));
        }
      : undefined,
  });
};

export const toggleMarkdownTask = (input: string, taskIndex: number) => {
  let currentIndex = 0;
  return input.replace(
    /^(\s*[-+*]\s+)\[([ xX])\]/gm,
    (match, prefix: string, state: string) => {
      if (currentIndex++ !== taskIndex) return match;
      return `${prefix}[${state === " " ? "x" : " "}]`;
    },
  );
};

export const findMarkdownTaskIndex = (target: EventTarget | null) => {
  if (!(target instanceof Element)) return null;
  const task = target.closest<HTMLElement>("[data-markdownish-task]");
  if (!task) return null;
  const index = Number(task.dataset.markdownishTask);
  return Number.isInteger(index) ? index : null;
};

export { getMarkdownListEdit, handleMarkdownishEnter } from "./keyboard";
