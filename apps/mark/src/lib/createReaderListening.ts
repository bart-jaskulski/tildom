import { createMemo, onCleanup, type Accessor } from "solid-js";
import { prepareListenArticle, stripReaderMedia } from "./listenText";

export function createReaderListening(source: Accessor<{ title: string; markdown: string } | null>) {
  const article = createMemo(() => {
    const value = source();
    return value ? prepareListenArticle(value.title, stripReaderMedia(value.markdown)) : null;
  });
  let reader: HTMLElement | undefined;
  let highlighted = -1;
  let seekSentence: ((index: number) => void) | undefined;
  let restoreFrame: number | undefined;
  const restoreScroll = (top: number) => {
    if (restoreFrame !== undefined) cancelAnimationFrame(restoreFrame);
    restoreFrame = requestAnimationFrame(() => window.scrollTo({ top, behavior: "instant" }));
  };
  onCleanup(() => { if (restoreFrame !== undefined) cancelAnimationFrame(restoreFrame); });
  const playPassage = (event: MouseEvent | KeyboardEvent) => {
    if (!article()) return;
    if (!(event.target instanceof Element) || event.target.closest("a, button, input, textarea, [contenteditable]")) return;
    if (event instanceof KeyboardEvent) {
      if (event.key !== "Enter" && event.key !== " ") return;
    } else if (event.button !== 0 || event.ctrlKey || event.metaKey || event.shiftKey || window.getSelection()?.toString()) return;
    const sentence = event.target.closest<HTMLElement>("[data-listen-sentence]")
      ?? event.target.closest("p, li, h1, h2, h3, h4, h5, h6, blockquote")?.querySelector<HTMLElement>("[data-listen-sentence]");
    if (!sentence) return;
    event.preventDefault();
    seekSentence?.(Number(sentence.dataset.listenSentence));
  };
  const highlightSentence = (index: number) => {
    if (index === highlighted) return;
    reader?.querySelectorAll("[data-listen-active], [data-listen-start-active], [data-listen-end-active]").forEach((element) => {
      element.removeAttribute("data-listen-active");
      element.removeAttribute("data-listen-start-active");
      element.removeAttribute("data-listen-end-active");
    });
    if (index >= 0) {
      const fragments = reader?.querySelectorAll<HTMLElement>(`[data-listen-sentence="${index}"]`);
      fragments?.forEach((element) => element.setAttribute("data-listen-active", ""));
      reader?.querySelectorAll(`[data-listen-start="${index}"]`).forEach((element) => element.setAttribute("data-listen-start-active", ""));
      reader?.querySelectorAll(`[data-listen-end="${index}"]`).forEach((element) => element.setAttribute("data-listen-end-active", ""));
      if (fragments?.length) {
        const first = fragments[0].getBoundingClientRect();
        const last = fragments[fragments.length - 1].getBoundingClientRect();
        if (first.top < Math.max(96, window.innerHeight * 0.2) || last.bottom > window.innerHeight * 0.75) {
          window.scrollTo({
            top: Math.max(0, window.scrollY + first.top - window.innerHeight * 0.3),
            behavior: window.matchMedia("(prefers-reduced-motion: reduce)").matches ? "instant" : "smooth",
          });
        }
      }
    }
    highlighted = index;
  };

  return {
    article,
    setReader: (element: HTMLElement) => { reader = element; },
    setSeek: (seek: (index: number) => void) => { seekSentence = seek; },
    playPassage,
    highlightSentence,
    restoreScroll,
  };
}
