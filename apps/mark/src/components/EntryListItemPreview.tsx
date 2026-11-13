import { A, useNavigate } from "@solidjs/router";
import { For, Show, createSignal } from "solid-js";
import { Button, Popover, PopoverItem, Search, useSearchContext } from "@tildom/ui";
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
  const navigate = useNavigate();
  const searchCtx = useSearchContext();
  const entry = () => props.entry;
  const [copied, setCopied] = createSignal(false);

  const title = () => entry().title || entry().domain || "Untitled";
  const readingTime = () => Math.max(1, Math.ceil(entry().readerTextLength / 1_000));
  const query = () => props.searchQuery ?? searchCtx.query();
  const hasVisibleMatch = () => searchTerms(query()).every((term) => [
    title(),
    previewText(entry()),
    ...entry().tags,
  ].some((value) => value.toLowerCase().includes(term)));

  const handleCopyLink = async () => {
    const url = entry().canonicalUrl || entry().sourceUrl;
    if (!url || typeof navigator === "undefined") return;
    try {
      await navigator.clipboard.writeText(url);
      setCopied(true);
      setTimeout(() => setCopied(false), 1500);
    } catch {}
  };

  const handleRowClick = (event: MouseEvent) => {
    if (props.loading || event.defaultPrevented || event.button !== 0) return;

    const target = event.target as HTMLElement | null;
    if (!target) return;

    if (target.closest("a, button, input, textarea, select, [role='button'], dialog, [popover]")) {
      return;
    }

    const selection = window.getSelection();
    if (selection && selection.toString().trim().length > 0) return;

    const id = entry().id;
    if (!id) return;

    if (event.metaKey || event.ctrlKey) {
      window.open(`/item/${id}`, "_blank");
    } else {
      navigate(`/item/${id}`);
    }
  };

  return (
    <article
      class={styles.row}
      classList={{
        [styles.activeRow]: props.isActive,
        [styles.loadingRow]: props.loading,
      }}
      data-entry-row
      data-active={props.isActive ? "" : undefined}
      onClick={handleRowClick}
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

          <div class={styles.menuAnchor}>
            <Button
              variant="text"
              type="button"
              class={styles.menuTrigger}
              aria-label={`Actions for ${title()}`}
              popovertarget={`entry-actions-${entry().id}`}
              style={{ "anchor-name": `--entry-anchor-${entry().id}` }}
            >
              [ ··· ]
            </Button>
            <Popover
              id={`entry-actions-${entry().id}`}
              anchorName={`--entry-anchor-${entry().id}`}
              positionArea="bottom span-left"
            >
              <Show when={entry().canonicalUrl || entry().sourceUrl}>
                <PopoverItem onClick={() => void handleCopyLink()}>
                  {copied() ? "[ copied! ]" : "[ copy link ]"}
                </PopoverItem>
              </Show>
              <Show when={props.onDelete}>
                <PopoverItem danger onClick={() => props.onDelete?.(entry().id)}>
                  [ delete ]
                </PopoverItem>
              </Show>
            </Popover>
          </div>
        </div>

        <Show when={entry().domain || entry().readerTextLength > 0 || entry().commentCount > 0}>
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
        </Show>

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
