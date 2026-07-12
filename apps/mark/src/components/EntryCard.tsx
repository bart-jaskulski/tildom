import { A } from "@solidjs/router";
import { For, Show } from "solid-js";
import { formatRelativeTimestamp, hasEntryLink, type Entry, type SearchResult } from "~/lib/entries";
import styles from "./EntryCard.module.css";

type EntryCardProps = {
  entry: Entry | SearchResult;
  matchText?: string;
  searchQuery?: string;
  onDelete?: (entryId: string) => void;
  isActive?: boolean;
};

const searchTerms = (query: string): string[] => query.toLowerCase().match(/[\p{L}\p{N}_]+/gu) ?? [];

const highlightText = (value: string, query: string) => {
  const terms = searchTerms(query).sort((left, right) => right.length - left.length);
  if (!terms.length) return [value];

  const pattern = terms.map((term) => term.replace(/[.*+?^${}()|[\]\\]/g, "\\$&")).join("|");
  return value.split(new RegExp(`(${pattern})`, "gi"));
};

const previewText = (entry: Entry | SearchResult) => {
  if (!hasEntryLink(entry)) {
    return entry.body;
  }

  return entry.excerpt || entry.body || entry.canonicalUrl || entry.sourceUrl || "";
};

export default function EntryCard(props: EntryCardProps) {
  const entry = () => props.entry;
  const title = () => entry().title || entry().domain || "Untitled";
  const timestamp = () => entry().lastCommentedAt ?? entry().createdAt;
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

  return (
    <article class={styles.row} classList={{ [styles.activeRow]: props.isActive }} data-entry-row data-active={props.isActive ? "" : undefined}>
        <div class={styles.titleline}>
          <A href={`/item/${entry().id}`} class={styles.title}>{highlighted(title())}</A>
          <Show when={entry().domain}>
            <span class={styles.domain}>({entry().domain})</span>
          </Show>
        </div>

        <div class="entry-subtext">
          <span>{formatRelativeTimestamp(timestamp())}</span>
          <span> | {entry().commentCount} {entry().commentCount === 1 ? "comment" : "comments"}</span>
          <Show when={entry().canonicalUrl}>
            <span> | </span>
            <a
              href={entry().canonicalUrl!}
              target="_blank"
              rel="noreferrer"
              onClick={(event) => event.stopPropagation()}
            >
              open
            </a>
          </Show>
          <Show when={props.onDelete}>
            <span> | </span>
            <button
              type="button"
              class="hn-link-button"
              onClick={() => props.onDelete?.(entry().id)}
            >
              delete
            </button>
          </Show>
        </div>

        <Show when={previewText(entry())}>
          <p class="entry-preview">{highlighted(previewText(entry()))}</p>
        </Show>

        <Show when={entry().tags.length > 0}>
          <p class="entry-tags">
            <For each={entry().tags}>
              {(tag) => (
                <A href={`/?q=${encodeURIComponent(`#${tag}`)}`} class="entry-tag">
                  #{highlighted(tag)}
                </A>
              )}
            </For>
          </p>
        </Show>

        <Show when={props.matchText && !hasVisibleMatch()}>
          <p class="entry-preview">{highlighted(props.matchText!)}</p>
        </Show>
    </article>
  );
}
