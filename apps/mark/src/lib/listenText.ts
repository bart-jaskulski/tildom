import { renderMarkdownishToHtml } from "@tildom/markdownish";

export const stripReaderMedia = (markdown: string) => markdown
  .replace(/!\[[^\]]*]\([^\n)]*\)/g, "")
  .replace(/\[\s*]\([^\n)]*\)/g, "");

export function prepareListenArticle(title: string, markdown: string) {
  const document = new DOMParser().parseFromString(renderMarkdownishToHtml(markdown, { compactLinks: true }), "text/html");
  const sentences = [title];
  const groups = new Map<Element, Text[]>();
  const walker = document.createTreeWalker(document.body, NodeFilter.SHOW_TEXT);
  while (walker.nextNode()) {
    const node = walker.currentNode as Text;
    if (node.parentElement?.closest("pre, code, script, style")) continue;
    const block = node.parentElement?.closest("p, li, h1, h2, h3, h4, h5, h6, td, th, blockquote") ?? document.body;
    const nodes = groups.get(block) ?? [];
    nodes.push(node);
    groups.set(block, nodes);
  }
  const segmenter = new Intl.Segmenter("en", { granularity: "sentence" });
  for (const nodes of groups.values()) {
    const text = nodes.map((node) => node.data).join("");
    const ranges = Array.from(segmenter.segment(text)).filter(({ segment }) => segment.trim()).map(({ index, segment }) => {
      const id = sentences.length;
      sentences.push(segment.trim());
      return { start: index + segment.length - segment.trimStart().length, end: index + segment.trimEnd().length, id };
    });
    let offset = 0;
    for (const node of nodes) {
      const fragment = document.createDocumentFragment();
      let cursor = 0;
      for (const range of ranges) {
        const start = Math.max(0, range.start - offset);
        const end = Math.min(node.length, range.end - offset);
        if (end <= start) continue;
        if (cursor < start) fragment.append(node.data.slice(cursor, start));
        const span = document.createElement("span");
        span.dataset.listenSentence = String(range.id);
        span.textContent = node.data.slice(start, end);
        fragment.append(span);
        cursor = end;
      }
      fragment.append(node.data.slice(cursor));
      offset += node.length;
      node.replaceWith(fragment);
    }
  }
  for (const inline of document.querySelectorAll<HTMLElement>("strong, em, del")) {
    const spans = inline.querySelectorAll<HTMLElement>("[data-listen-sentence]");
    if (spans.length) {
      inline.dataset.listenStart = spans[0].dataset.listenSentence;
      inline.dataset.listenEnd = spans[spans.length - 1].dataset.listenSentence;
    }
  }
  const actions = new Set<number>();
  for (const span of document.querySelectorAll<HTMLElement>("[data-listen-sentence]")) {
    const id = Number(span.dataset.listenSentence);
    if (actions.has(id) || span.closest("a")) continue;
    actions.add(id);
    span.tabIndex = 0;
    span.setAttribute("role", "button");
    span.setAttribute("aria-label", `Play from: ${sentences[id]}`);
  }
  return { html: document.body.innerHTML, sentences };
}

export function sentenceAtSample(ends: number[], sample: number) {
  return ends.findIndex((end) => sample < end);
}
