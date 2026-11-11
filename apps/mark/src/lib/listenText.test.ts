import { expect, it } from "vitest";
import { prepareListenArticle, sentenceAtSample } from "./listenText";

it("preserves inline links and emphasis while mapping spoken sentences across markup", () => {
  const article = prepareListenArticle("Title", "Read **this [source](https://example.com)** first. Then continue.");
  expect(article.sentences).toEqual(["Title", "Read this source first.", "Then continue."]);
  const document = new DOMParser().parseFromString(article.html, "text/html");
  expect(document.querySelector("a")?.getAttribute("href")).toBe("https://example.com");
  expect(document.querySelector("strong")?.textContent).toBe("this source");
  expect([...document.querySelectorAll('[data-listen-sentence="1"]')].map((node) => node.textContent).join("")).toBe("Read this source first.");
});

it("does not narrate code, image descriptions, or link URLs", () => {
  const article = prepareListenArticle("Title", "First paragraph with [a source](https://example.com).\n\n![A photograph](https://example.com/image.jpg)\n\n```js\nalert('skip this');\n```\n\nLast paragraph.");
  expect(article.sentences).toEqual(["Title", "First paragraph with a source.", "Last paragraph."]);
});

it("follows the playing sentence at exact sample boundaries", () => {
  expect(sentenceAtSample([24000, 72000], 23999)).toBe(0);
  expect(sentenceAtSample([24000, 72000], 24000)).toBe(1);
  expect(sentenceAtSample([24000, 72000], 72000)).toBe(-1);
});

it("keeps spaces outside sentence highlights without changing rendered text", () => {
  const article = prepareListenArticle("Title", "A prototype *very* quickly, with little effort. Instant dopamine!");
  const document = new DOMParser().parseFromString(article.html, "text/html");
  expect(document.body.textContent).toBe("A prototype very quickly, with little effort. Instant dopamine!");
  expect([...document.querySelectorAll('[data-listen-sentence="1"]')].map((node) => node.textContent).join("")).toBe("A prototype very quickly, with little effort.");
  expect(document.querySelector('[data-listen-sentence="2"]')?.textContent).toBe("Instant dopamine!");
  expect(document.querySelector('em')?.textContent).toBe("very");
});

it("offers one keyboard passage action without replacing inline links", () => {
  const article = prepareListenArticle("Title", "Read [a source](https://example.com) now.");
  const document = new DOMParser().parseFromString(article.html, "text/html");
  expect(document.querySelectorAll('[role="button"]').length).toBe(1);
  expect(document.querySelector('[role="button"]')?.getAttribute("tabindex")).toBe("0");
  expect(document.querySelector("a")?.getAttribute("href")).toBe("https://example.com");
});

it("maps opening and closing emphasis marks to their own sentences", () => {
  const article = prepareListenArticle("Title", "*First sentence. Second sentence.*");
  const document = new DOMParser().parseFromString(article.html, "text/html");
  const em = document.querySelector<HTMLElement>("em")!;
  expect(em.dataset.listenStart).toBe("1");
  expect(em.dataset.listenEnd).toBe("2");
  expect(article.sentences).toEqual(["Title", "First sentence.", "Second sentence."]);
});
