import { Title } from "@solidjs/meta";
import { A, useParams } from "@solidjs/router";
import { createEffect, createResource, createSignal, onCleanup, onMount, Show } from "solid-js";
import { isServer } from "solid-js/web";
import { renderMarkdownishToHtml } from "@tildom/markdownish";
import ItemLoading from "~/components/ItemLoading";
import TextButton from "~/components/TextButton";
import { captureEntry, fetchEntryDetail, isEntryStoreReady, recordEntryOpen } from "~/stores/entryStore";
import styles from "./read.module.css";

const stripReaderMedia = (markdown: string) => markdown
  .replace(/!\[[^\]]*]\([^\n)]*\)/g, "")
  .replace(/\[\s*]\([^\n)]*\)/g, "");

export default function ItemReaderPage() {
  const params = useParams();
  const [isCapturing, setIsCapturing] = createSignal(false);
  const [isContentReady, setIsContentReady] = createSignal(false);
  const [readingProgress, setReadingProgress] = createSignal(0);
  const [showScrollTop, setShowScrollTop] = createSignal(false);
  const [detail, { refetch }] = createResource(
    () => (!isServer && isEntryStoreReady() ? params.id ?? null : null),
    (entryId) => fetchEntryDetail(entryId),
  );
  let attemptedEntryId: string | undefined;
  let updateReadingProgress = () => {};

  const capture = async () => {
    const entry = detail()?.entry;
    if (!entry?.canonicalUrl || isCapturing()) return;

    setIsCapturing(true);
    await captureEntry(entry.id, entry.canonicalUrl);
    await refetch();
    setIsCapturing(false);
  };

  createEffect(() => {
    const entry = detail()?.entry;
    if (!entry || entry.id === attemptedEntryId || detail()?.capture) return;

    attemptedEntryId = entry.id;
    void recordEntryOpen(entry.id);
    void capture();
  });

  createEffect(() => {
    if (detail()?.capture?.status !== "ready") {
      setIsContentReady(false);
      return;
    }

    let secondFrame: number | undefined;
    const firstFrame = requestAnimationFrame(() => {
      secondFrame = requestAnimationFrame(() => {
        updateReadingProgress();
        setIsContentReady(true);
      });
    });
    onCleanup(() => {
      cancelAnimationFrame(firstFrame);
      if (secondFrame !== undefined) cancelAnimationFrame(secondFrame);
    });
  });

  onMount(() => {
    let lastScrollY = window.scrollY;
    updateReadingProgress = () => {
      const scrollableHeight = document.documentElement.scrollHeight - window.innerHeight;
      const progress = scrollableHeight > 0 ? (window.scrollY / scrollableHeight) * 100 : 100;
      setReadingProgress(Math.min(100, Math.max(0, progress)));

      if (window.scrollY <= 240 || window.scrollY > lastScrollY) {
        setShowScrollTop(false);
      } else if (window.scrollY < lastScrollY) {
        setShowScrollTop(true);
      }
      lastScrollY = window.scrollY;
    };

    updateReadingProgress();
    window.addEventListener("scroll", updateReadingProgress, { passive: true });
    window.addEventListener("resize", updateReadingProgress);
    onCleanup(() => {
      window.removeEventListener("scroll", updateReadingProgress);
      window.removeEventListener("resize", updateReadingProgress);
    });
  });

  return (
    <>
    <Show when={detail()?.entry} fallback={
      !isEntryStoreReady() || detail.loading ? <ItemLoading /> : <p class="hn-status">Item not found</p>
    }>
      {(entry) => (
        <article class={styles.reader} lang={detail()?.capture?.language ?? undefined}>
          <Title>{`${entry().title} | reader | mark.tildom`}</Title>
          <header class={styles.header}>
            <p class={styles.actions}>
              <A href={`/item/${entry().id}`}>back to item</A>
              <Show when={entry().canonicalUrl}>
                <span> | </span>
                <a href={entry().canonicalUrl!} target="_blank" rel="noreferrer">original</a>
              </Show>
            </p>
            <h1>{entry().title}</h1>
            <Show when={detail()?.capture?.byline || detail()?.capture?.siteName || detail()?.capture?.publishedAt}>
              <p class={styles.meta}>
                {[detail()?.capture?.byline, detail()?.capture?.siteName, detail()?.capture?.publishedAt].filter(Boolean).join(" · ")}
              </p>
            </Show>
          </header>

          <Show when={detail()?.capture?.status === "ready"} fallback={
            <section class="hn-status" aria-live="polite">
              <Show when={isCapturing() || detail()?.capture?.status === "pending"} fallback={
                <>
                  <p>{detail()?.capture?.error ?? "Reader view is unavailable for this page."}</p>
                  <TextButton type="button" inline onClick={() => void capture()} disabled={!entry().canonicalUrl || isCapturing()}>
                    try again
                  </TextButton>
                </>
              }>
                saving reader copy…
              </Show>
            </section>
          }>
            <div
              class={`${styles.content} markdownish`}
              innerHTML={renderMarkdownishToHtml(stripReaderMedia(detail()!.capture!.markdown), { compactLinks: true })}
            />
          </Show>
        </article>
      )}
    </Show>
    <Show when={showScrollTop()}>
      <button class={styles.scrollTop} type="button" onClick={() => window.scrollTo({ top: 0, behavior: "smooth" })}>
        ↑ top
      </button>
    </Show>
    <Show when={isContentReady()}>
      <div
        class={styles.progress}
        role="progressbar"
        aria-label="Reading progress"
        aria-valuemin="0"
        aria-valuemax="100"
        aria-valuenow={Math.round(readingProgress())}
      >
        <div style={{ width: `${readingProgress()}%` }} />
      </div>
    </Show>
    </>
  );
}
