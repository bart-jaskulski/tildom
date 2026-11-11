import { cleanup, fireEvent, render } from "@solidjs/testing-library";
import { afterEach, expect, it, vi } from "vitest";
import { createReaderListening } from "./createReaderListening";

function mountReader() {
  let listening!: ReturnType<typeof createReaderListening>;
  const seek = vi.fn();
  const view = render(() => {
    listening = createReaderListening(() => ({ title: "Title", markdown: "First *styled* sentence. Second sentence with [a link](https://example.com)." }));
    listening.setSeek(seek);
    return <article ref={listening.setReader} onClick={listening.playPassage} onKeyDown={listening.playPassage}>
      <h1><span data-listen-sentence="0" role="button" tabIndex={0}>Title</span></h1>
      <div innerHTML={listening.article()!.html} />
    </article>;
  });
  return { ...view, listening, seek };
}

afterEach(() => { cleanup(); window.getSelection()?.removeAllRanges(); vi.restoreAllMocks(); vi.unstubAllGlobals(); });

it("seeks through sentence fragments, paragraph whitespace, and the keyboard while leaving links and selected text alone", () => {
  const { container, seek } = mountReader();
  const first = container.querySelector<HTMLElement>('[data-listen-sentence="1"]')!;
  fireEvent.click(first);
  expect(seek).toHaveBeenLastCalledWith(1);
  fireEvent.keyDown(container.querySelector('[data-listen-sentence="0"]')!, { key: "Enter" });
  expect(seek).toHaveBeenLastCalledWith(0);
  fireEvent.click(container.querySelector('p')!);
  expect(seek).toHaveBeenLastCalledWith(1);
  seek.mockClear();
  fireEvent.keyDown(first, { key: "ArrowDown" });
  fireEvent.click(first, { ctrlKey: true });
  const link = container.querySelector('a')!;
  link.addEventListener("click", (event) => event.preventDefault());
  fireEvent.click(link.querySelector('[data-listen-sentence]')!);
  const selection = document.createRange();
  selection.selectNodeContents(first);
  window.getSelection()!.addRange(selection);
  fireEvent.click(first);
  expect(seek).not.toHaveBeenCalled();
});

it("moves the highlight across formatted fragments and Markdown markers without scrolling visible sentences", () => {
  const { container, listening } = mountReader();
  const scroll = vi.spyOn(window, "scrollTo").mockImplementation(() => {});
  vi.spyOn(HTMLElement.prototype, "getBoundingClientRect").mockReturnValue({ top: 200, bottom: 220 } as DOMRect);
  listening.highlightSentence(1);
  const fragments = container.querySelectorAll('[data-listen-sentence="1"]');
  expect(fragments.length).toBeGreaterThan(1);
  for (const fragment of fragments) expect(fragment).toHaveAttribute("data-listen-active");
  expect(container.querySelector('em')).toHaveAttribute("data-listen-start-active");
  expect(container.querySelector('em')).toHaveAttribute("data-listen-end-active");
  listening.highlightSentence(2);
  for (const fragment of fragments) expect(fragment).not.toHaveAttribute("data-listen-active");
  expect(container.querySelector('em')).not.toHaveAttribute("data-listen-start-active");
  expect(container.querySelector('[data-listen-sentence="2"]')).toHaveAttribute("data-listen-active");
  listening.highlightSentence(-1);
  expect(container.querySelector('[data-listen-active]')).toBeNull();
  expect(scroll).not.toHaveBeenCalled();
});

it("follows offscreen speech with reduced motion and cancels pending scroll restoration on unmount", () => {
  const { listening, unmount } = mountReader();
  const scroll = vi.spyOn(window, "scrollTo").mockImplementation(() => {});
  vi.spyOn(HTMLElement.prototype, "getBoundingClientRect").mockReturnValue({ top: 1000, bottom: 1020 } as DOMRect);
  vi.stubGlobal("matchMedia", () => ({ matches: true }));
  listening.highlightSentence(1);
  expect(scroll).toHaveBeenLastCalledWith({ top: 1000 - window.innerHeight * 0.3, behavior: "instant" });
  let restore!: FrameRequestCallback;
  vi.stubGlobal("requestAnimationFrame", (callback: FrameRequestCallback) => { restore = callback; return 1; });
  const cancel = vi.fn();
  vi.stubGlobal("cancelAnimationFrame", cancel);
  listening.restoreScroll(400);
  restore(0);
  expect(scroll).toHaveBeenLastCalledWith({ top: 400, behavior: "instant" });
  listening.restoreScroll(600);
  unmount();
  expect(cancel).toHaveBeenCalledWith(1);
});
