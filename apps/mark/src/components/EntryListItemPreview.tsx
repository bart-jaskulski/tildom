import { A } from "@solidjs/router";
import { For, Show } from "solid-js";
import { hasEntryLink, type Entry, type SearchResult } from "~/lib/entries";
import { stripTrailingTagLines } from "~/lib/tags";
import styles from "./EntryListItemPreview.module.css";
import TextButton from "./TextButton";
import ExternalLink from "lucide-solid/icons/external-link";

type EntryListItemPreviewProps = {
  entry: Entry | SearchResult;
  matchText?: string;
  searchQuery?: string;
  onDelete?: (entryId: string) => void;
  isActive?: boolean;
  loading?: boolean;
};

const searchTerms = (query: string): string[] => query.toLowerCase().match(/[\p{L}\p{N}_]+/gu) ?? [];

const highlightText = (value: string, query: string) => {
  const terms = searchTerms(query).sort((left, right) => right.length - left.length);
  if (!terms.length) return [value];

  const pattern = terms.map((term) => term.replace(/[.*+?^${}()|[\]\\]/g, "\\$&")).join("|");
  return value.split(new RegExp(`(${pattern})`, "gi"));
};

const previewText = (entry: Entry | SearchResult) => {
  const body = stripTrailingTagLines(entry.body);
  if (!hasEntryLink(entry)) {
    return body;
  }

  return entry.excerpt || body || entry.canonicalUrl || entry.sourceUrl || "";
};

export default function EntryListItemPreview(props: EntryListItemPreviewProps) {
  const entry = () => props.entry;
  let touchStart: { x: number; y: number } | undefined;
  const title = () => entry().title || entry().domain || "Untitled";
  const readingTime = () => Math.max(1, Math.ceil(entry().readerTextLength / 1_000));
  const hasVisibleMatch = () => searchTerms(props.searchQuery ?? "").every((term) => [
    title(),
    previewText(entry()),
    ...entry().tags,
  ].some((value) => value.toLowerCase().includes(term)));
  const highlighted = (value: string) => (
    <For each={highlightText(value, props.searchQuery ?? "")}>
      {(part) => searchTerms(props.searchQuery ?? "").includes(part.toLowerCase())
        ? <mark class={styles.searchHighlight}>{part}</mark>
        : part}
    </For>
  );
  const resetTouch = () => {
    touchStart = undefined;
  };
  const handlePointerDown = (event: PointerEvent) => {
    if (event.pointerType === "touch") touchStart = { x: event.clientX, y: event.clientY };
  };
  const handlePointerUp = (event: PointerEvent) => {
    const start = touchStart;
    resetTouch();
    if (!start || event.pointerType !== "touch") return;

    const horizontalDistance = event.clientX - start.x;
    const verticalDistance = event.clientY - start.y;
    if (!props.onDelete || horizontalDistance > -72 || Math.abs(horizontalDistance) <= Math.abs(verticalDistance)) return;

    window.addEventListener("click", (clickEvent) => {
      clickEvent.preventDefault();
      clickEvent.stopPropagation();
    }, { capture: true, once: true });
    props.onDelete(entry().id);
  };

  return (
    <article
      class={styles.row}
      classList={{ [styles.activeRow]: props.isActive }}
      data-entry-row
      data-active={props.isActive ? "" : undefined}
      onPointerDown={handlePointerDown}
      onPointerUp={handlePointerUp}
      onPointerCancel={resetTouch}
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
          <A href={`/item/${entry().id}`} class={styles.title}>
            <Show when={!entry().firstOpenedAt}>
              <span class={styles.unopenedMarker} title="Not opened yet" aria-label="Not opened yet">•</span>
            </Show>
            {highlighted(title())}
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
        </div>

        <div class={styles.actions}>
          <A href={`/item/${entry().id}`}>edit</A>
          <Show when={entry().canonicalUrl}>
            <span aria-hidden="true">|</span>
            <A href={`/item/${entry().id}/read`}>
              read
            </A>
          </Show>
          <Show when={props.onDelete}>
            <span aria-hidden="true">|</span>
            <TextButton
              type="button"
              inline
              onClick={() => props.onDelete?.(entry().id)}
            >
              delete
            </TextButton>
          </Show>
        </div>

        <Show when={previewText(entry())}>
          <p class={styles.preview}>{highlighted(previewText(entry()))}</p>
        </Show>

        <Show when={entry().tags.length > 0}>
          <p class={styles.tags}>
            <For each={entry().tags}>
              {(tag) => (
                <A href={`/?q=${encodeURIComponent(`#${tag}`)}`} class={styles.tag}>
                  #{highlighted(tag)}
                </A>
              )}
            </For>
          </p>
        </Show>

        <Show when={props.matchText && !hasVisibleMatch()}>
          <p class={styles.preview}>{highlighted(props.matchText!)}</p>
        </Show>
      </Show>
    </article>
  );
}
