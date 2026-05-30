import { A } from "@solidjs/router";
import { Show } from "solid-js";
import { formatRelativeTimestamp, hasEntryLink, type Entry, type SearchResult } from "~/lib/entries";

type EntryCardProps = {
  entry: Entry | SearchResult;
  matchLabel?: string;
  matchText?: string;
  onDelete?: (entryId: string) => void;
  isActive?: boolean;
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

  return (
    <article class={`entry-row ${props.isActive ? "active-row" : ""}`}>
        <div class="entry-titleline">
          <A href={`/item/${entry().id}`} class="entry-title">{title()}</A>
        </div>
        <Show when={entry().domain}>
          <div class="entry-domain">({entry().domain})</div>
        </Show>

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
          <p class="entry-preview">{previewText(entry())}</p>
        </Show>

        <Show when={props.matchText}>
          <p class="entry-match">
            <span>{props.matchLabel ?? "Match"}:</span>{" "}
            {props.matchText}
          </p>
        </Show>
    </article>
  );
}
