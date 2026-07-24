import { micromark } from "micromark";
import { gfm, gfmHtml } from "micromark-extension-gfm";
import sanitizeHtml from "sanitize-html";

type RenderMarkdownishOptions = {
  hashtags?: boolean;
  tasks?: boolean;
};

export const renderMarkdownishToHtml = (
  input: string,
  options: RenderMarkdownishOptions = {},
) => {
  const markdown = input.trim();
  if (!markdown) return "";

  let taskIndex = 0;
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
      a: ["href", "name", "target", "rel"],
      button: ["aria-label", "aria-pressed", "class", "data-markdownish-task", "type"],
      img: ["src", "alt", "title"],
      span: ["class", "data-markdownish-task"],
    },
    transformTags: {
      a: sanitizeHtml.simpleTransform("a", {
        rel: "noreferrer noopener",
        target: "_blank",
      }),
    },
    textFilter: options.hashtags
      ? (text, tagName) => {
          if (tagName === "a" || tagName === "code" || tagName === "pre") return text;
          return text.replace(
            /(^|[^\w])#([a-zA-Z0-9_-]+)/g,
            '$1<button type="button" class="markdownish-tag" data-markdownish-tag="$2">#$2</button>',
          );
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

type TextEdit = {
  from: number;
  to: number;
  text: string;
  caret: number;
};

export const getMarkdownListEdit = (
  value: string,
  selectionStart: number,
  selectionEnd: number,
): TextEdit | null => {
  if (selectionStart !== selectionEnd) return null;

  const lineStart = value.lastIndexOf("\n", selectionStart - 1) + 1;
  const beforeCaret = value.slice(lineStart, selectionStart);
  const unordered = beforeCaret.match(/^(\s*)([-+*])\s+(\[[ xX]\]\s+)?(.*)$/);

  if (unordered) {
    const [, indent, bullet, task = "", content] = unordered;
    if (!content.trim()) {
      return { from: lineStart, to: selectionStart, text: "", caret: lineStart };
    }

    const prefix = `${indent}${bullet} ${task ? "[ ] " : ""}`;
    return {
      from: selectionStart,
      to: selectionEnd,
      text: `\n${prefix}`,
      caret: selectionStart + prefix.length + 1,
    };
  }

  const ordered = beforeCaret.match(/^(\s*)(\d+)([.)])\s+(.*)$/);
  if (!ordered) return null;

  const [, indent, number, delimiter, content] = ordered;
  if (!content.trim()) {
    return { from: lineStart, to: selectionStart, text: "", caret: lineStart };
  }

  const prefix = `${indent}${Number(number) + 1}${delimiter} `;
  return {
    from: selectionStart,
    to: selectionEnd,
    text: `\n${prefix}`,
    caret: selectionStart + prefix.length + 1,
  };
};

export const handleMarkdownishEnter = (event: KeyboardEvent) => {
  if (
    event.key !== "Enter"
    || event.shiftKey
    || event.altKey
    || event.ctrlKey
    || event.metaKey
    || event.isComposing
  ) return false;

  const textarea = event.currentTarget;
  if (!(textarea instanceof HTMLTextAreaElement)) return false;

  const edit = getMarkdownListEdit(
    textarea.value,
    textarea.selectionStart,
    textarea.selectionEnd,
  );
  if (!edit) return false;

  event.preventDefault();
  textarea.setRangeText(edit.text, edit.from, edit.to, "end");
  textarea.setSelectionRange(edit.caret, edit.caret);
  textarea.dispatchEvent(new InputEvent("input", {
    bubbles: true,
    inputType: "insertLineBreak",
    data: edit.text,
  }));
  return true;
};
