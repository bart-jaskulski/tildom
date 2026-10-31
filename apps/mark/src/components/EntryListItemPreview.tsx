import { A } from "@solidjs/router";
import { For, Show, createSignal } from "solid-js";
import { Search, useSearchContext } from "@tildom/ui";
import { hasEntryLink, type Entry, type SearchResult } from "~/lib/entries";
import { stripTrailingTagLines } from "~/lib/tags";
import styles from "./EntryListItemPreview.module.css";
import ExternalLink from "lucide-solid/icons/external-link";

type EntryListItemPreviewProps = {
  entry: Entry | SearchResult;
  matchText?: string;
  searchQuery?: string;
  onDelete?: (entryId: string) => void;
  isActive?: boolean;
  loading?: boolean;
};

const searchTerms = (query: string): string[] => query.toLowerCase().match(/[\p{L}\p{N}_-]+/gu) ?? [];

const previewText = (entry: Entry | SearchResult) => {
  const body = stripTrailingTagLines(entry.body);
  if (!hasEntryLink(entry)) {
    return body;
  }

  return entry.excerpt || body || entry.canonicalUrl || entry.sourceUrl || "";
};

export default function EntryListItemPreview(props: EntryListItemPreviewProps) {
  const searchCtx = useSearchContext();
  const entry = () => props.entry;
  let touchStart: { x: number; y: number } | undefined;
  let isHorizontalGesture = false;
  const [swipeOffset, setSwipeOffset] = createSignal(0);
  const [isSwiping, setIsSwiping] = createSignal(false);

  const title = () => entry().title || entry().domain || "Untitled";
  const readingTime = () => Math.max(1, Math.ceil(entry().readerTextLength / 1_000));
  const query = () => props.searchQuery ?? searchCtx.query();
  const hasVisibleMatch = () => searchTerms(query()).every((term) => [
    title(),
    previewText(entry()),
    ...entry().tags,
  ].some((value) => value.toLowerCase().includes(term)));
  const resetTouch = () => {
    touchStart = undefined;
    isHorizontalGesture = false;
  };
  const handlePointerDown = (event: PointerEvent) => {
    if (!props.onDelete || event.pointerType !== "touch") return;
    touchStart = { x: event.clientX, y: event.clientY };
    isHorizontalGesture = false;
  };
  const handlePointerMove = (event: PointerEvent) => {
    if (!touchStart || event.pointerType !== "touch") return;

    const dx = event.clientX - touchStart.x;
    const dy = event.clientY - touchStart.y;

    if (!isHorizontalGesture) {
      if (Math.abs(dy) > Math.abs(dx)) {
        resetTouch();
        return;
      }
      if (Math.abs(dx) > 8) {
        isHorizontalGesture = true;
        try {
          (event.currentTarget as HTMLElement).setPointerCapture?.(event.pointerId);
        } catch {}
      }
    }

    if (isHorizontalGesture) {
      setIsSwiping(true);
      setSwipeOffset(Math.max(-120, Math.min(0, dx)));
    }
  };
  const handlePointerUp = (event: PointerEvent) => {
    const start = touchStart;
    const swiped = isSwiping();
    resetTouch();
    setIsSwiping(false);
    if (!start || event.pointerType !== "touch") return;

    try {
      (event.currentTarget as HTMLElement).releasePointerCapture?.(event.pointerId);
    } catch {}

    const horizontalDistance = event.clientX - start.x;
    const verticalDistance = event.clientY - start.y;

    if (swiped || Math.abs(horizontalDistance) > 10) {
      window.addEventListener("click", (clickEvent) => {
        clickEvent.preventDefault();
        clickEvent.stopPropagation();
      }, { capture: true, once: true });
    }

    if (props.onDelete && horizontalDistance <= -72 && Math.abs(horizontalDistance) > Math.abs(verticalDistance)) {
      props.onDelete(entry().id);
    }

    setSwipeOffset(0);
  };
  const handlePointerCancel = (event: PointerEvent) => {
    try {
      (event.currentTarget as HTMLElement).releasePointerCapture?.(event.pointerId);
    } catch {}
    resetTouch();
    setIsSwiping(false);
    setSwipeOffset(0);
  };

  return (
    <article
      class={styles.row}
      classList={{
        [styles.activeRow]: props.isActive,
        [styles.swiping]: isSwiping(),
        [styles.swipeDelete]: swipeOffset() <= -72,
      }}
      style={{
        transform: swipeOffset() !== 0 ? `translateX(${swipeOffset()}px)` : undefined,
      }}
      data-entry-row
      data-active={props.isActive ? "" : undefined}
      onPointerDown={handlePointerDown}
      onPointerMove={handlePointerMove}
      onPointerUp={handlePointerUp}
      onPointerCancel={handlePointerCancel}
    >
      <Show
        when={!props.loading}
        fallback={(
          <>
            <span class={styles.loadingTitle} />
            <span class={styles.loadingMeta} />
            <span class={styles.loadingPreview} />
          </>
        )}
      >
        <div class={styles.titleline}>
          <div class={styles.titleGroup}>
            <A href={`/item/${entry().id}`} class={styles.title}>
              <Show when={!entry().firstOpenedAt}>
                <span class={styles.unopenedMarker} title="Not opened yet" aria-label="Not opened yet">•</span>
              </Show>
              <Search.Highlight>{title()}</Search.Highlight>
            </A>
            <Show when={entry().canonicalUrl}>
              {" "}
              <a
                href={entry().canonicalUrl!}
                rel="noreferrer"
                target="_blank"
                class={styles.externalLink}
              >[<ExternalLink />]</a>
            </Show>
          </div>

          <Show when={props.onDelete}>
            <button
              type="button"
              class={styles.deleteButton}
              onClick={(event) => {
                event.preventDefault();
                event.stopPropagation();
                props.onDelete?.(entry().id);
              }}
              title="Delete entry"
              aria-label="Delete entry"
            >
              delete
            </button>
          </Show>
        </div>

        <div class={styles.meta}>
          <Show when={entry().domain}>
            <A href={`/?q=${encodeURIComponent(entry().domain!)}&domain=${encodeURIComponent(entry().domain!)}`} class={styles.domain}>
              ({entry().domain})
            </A>
          </Show>
          <Show when={entry().readerTextLength > 0}>
            <span>≈{readingTime()}m</span>
          </Show>
          <Show when={entry().commentCount > 0}>
            <span>{entry().commentCount} {entry().commentCount === 1 ? "note" : "notes"}</span>
          </Show>
          <Show when={entry().canonicalUrl}>
            <A href={`/item/${entry().id}/read`} class={styles.readLink}>
              read
            </A>
          </Show>
        </div>

        <Show when={previewText(entry())}>
          <p class={styles.preview}><Search.Highlight>{previewText(entry())}</Search.Highlight></p>
        </Show>

        <Show when={entry().tags.length > 0}>
          <p class={styles.tags}>
            <For each={entry().tags}>
              {(tag) => (
                <A href={`/?q=${encodeURIComponent(`#${tag}`)}`} class={styles.tag}>
                  #<Search.Highlight>{tag}</Search.Highlight>
                </A>
              )}
            </For>
          </p>
        </Show>

        <Show when={props.matchText && !hasVisibleMatch()}>
          <p class={styles.preview}><Search.Highlight>{props.matchText!}</Search.Highlight></p>
        </Show>
      </Show>
    </article>
  );
}
