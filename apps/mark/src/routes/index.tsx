import { Title } from "@solidjs/meta";
import { useNavigate, useSearchParams } from "@solidjs/router";
import { For, Show, createEffect, createMemo, createResource, createSignal } from "solid-js";
import { isServer } from "solid-js/web";
import { useVimKeymaps } from "@tildom/ui";
import ClipboardPaste from "lucide-solid/icons/clipboard-paste";
import Button from "~/components/Button";
import EntryComposer from "~/components/EntryComposer";
import MobileEntryDialog from "~/components/MobileEntryDialog";
import styles from "./index.module.css";
import EntryListItemPreview from "~/components/EntryListItemPreview";
import { client } from "~/lib/db";
import { isUrlOnlyInput, type Entry, type SearchResult } from "~/lib/entries";
import { searchLocalEntries } from "~/lib/searchIndex";
import { createEntry, deleteEntry, entries, isEntryStoreReady, recordEntryOpen } from "~/stores/entryStore";

const PAGE_SIZE = 20;
const STARTUP_ROWS = [0, 1, 2];
const STARTUP_ENTRY: Entry = {
  id: "",
  sourceUrl: null,
  canonicalUrl: null,
  domain: null,
  title: "",
  body: "",
  excerpt: null,
  excerptStatus: "idle",
  excerptError: null,
  createdAt: 0,
  updatedAt: 0,
  lastCommentedAt: null,
  firstOpenedAt: null,
  lastOpenedAt: null,
  commentCount: 0,
  tags: [],
};

const isSearchResult = (entry: Entry | SearchResult): entry is SearchResult => "matchText" in entry;

const parsePage = (value: unknown) => {
  const page = Number(value);
  return Number.isInteger(page) && page > 0 ? page : 1;
};

function StartupEntries() {
  return (
    <section class={styles.startup} role="status" aria-live="polite">
      <span class="visually-hidden">Opening local library</span>
      <ol class={styles.startupList} aria-hidden="true">
        <For each={STARTUP_ROWS}>
          {() => (
            <li class={styles.entryItem}>
              <EntryListItemPreview entry={STARTUP_ENTRY} loading />
            </li>
          )}
        </For>
      </ol>
    </section>
  );
}

export default function Home() {
  const [params, setParams] = useSearchParams();
  const [entryBody, setEntryBody] = createSignal("");
  let desktopEntryTextarea: HTMLTextAreaElement | undefined;
  let mobileEntryTextarea: HTMLTextAreaElement | undefined;
  let mobileComposer: HTMLDialogElement | undefined;
  const [error, setError] = createSignal<string | null>(null);
  const [isSaving, setIsSaving] = createSignal(false);
  const searchQuery = createMemo(() => String(params.q ?? "").trim());
  const domainFilter = createMemo(() => String(params.domain ?? "").trim().toLowerCase());
  const [results] = createResource(
    () => (!isServer && isEntryStoreReady() && searchQuery() ? [searchQuery(), domainFilter(), client.dbVersion] as const : null),
    ([query, domain]) => searchLocalEntries(query, domain),
  );
  const visibleEntries = createMemo(() => searchQuery() ? results() ?? [] : entries());
  const isEmpty = createMemo(() => isEntryStoreReady() && !results.loading && visibleEntries().length === 0);
  const requestedPage = createMemo(() => parsePage(params.page));
  const totalPages = createMemo(() => Math.max(1, Math.ceil(visibleEntries().length / PAGE_SIZE)));
  const currentPage = createMemo(() => Math.min(requestedPage(), totalPages()));
  const pageStart = createMemo(() => (currentPage() - 1) * PAGE_SIZE);
  const paginatedEntries = createMemo(() => visibleEntries().slice(pageStart(), pageStart() + PAGE_SIZE));
  const navigate = useNavigate();
  let entryList: HTMLOListElement | undefined;
  const [activeIndex, setActiveIndex] = createSignal<number | null>(null);
  const selectedEntry = () => {
    const index = activeIndex();
    return index === null ? undefined : paginatedEntries()[index];
  };

  const focusEntryComposer = () => {
    if (window.matchMedia("(max-width: 640px)").matches) {
      if (!mobileComposer?.open) mobileComposer?.showModal();
      requestAnimationFrame(() => mobileEntryTextarea?.focus());
      return;
    }

    desktopEntryTextarea?.focus();
  };

  createEffect(() => {
    const max = paginatedEntries().length - 1;
    const index = activeIndex();
    if (index !== null && index > max) {
      setActiveIndex(max < 0 ? null : max);
    }
  });

  const scrollActiveIntoView = () => {
    requestAnimationFrame(() => {
      const activeRowEl = document.querySelector("[data-entry-row][data-active]");
      activeRowEl?.scrollIntoView({ block: "center", behavior: "smooth" });
    });
  };

  useVimKeymaps([
    {
      lhs: "j",
      callback: () => {
        setActiveIndex(prev => {
          const max = paginatedEntries().length - 1;
          return max < 0 ? null : Math.min((prev ?? -1) + 1, max);
        });
        scrollActiveIntoView();
      },
      help: "next item",
    },
    {
      lhs: "k",
      callback: () => {
        setActiveIndex(prev => prev === null ? 0 : Math.max(prev - 1, 0));
        scrollActiveIntoView();
      },
      help: "previous item",
    },
    { lhs: "i", callback: focusEntryComposer, help: "focus new bookmark" },
    { lhs: ":w", callback: () => {
      if (entryBody()) void handleSubmit(new Event("submit") as SubmitEvent);
    }, help: "save" },
    { lhs: ["gx", "o"], callback: () => {
      const selected = selectedEntry();
      if (selected?.canonicalUrl) {
        void recordEntryOpen(selected.id);
        window.open(selected.canonicalUrl, "_blank", "noreferrer");
      }
    }, help: "open original URL" },
    { lhs: "gg", callback: () => { setActiveIndex(paginatedEntries().length ? 0 : null); scrollActiveIntoView(); }, help: "first item" },
    { lhs: "G", callback: () => { const max = paginatedEntries().length - 1; setActiveIndex(max < 0 ? null : max); scrollActiveIntoView(); }, help: "last item" },
    { lhs: ["e", "Enter"], callback: () => {
      const selected = selectedEntry();
      if (selected) navigate(`/item/${selected.id}`);
    }, help: "open selected item" },
        { lhs: "d", callback: () => {
          const selected = selectedEntry();
          if (selected) void handleDelete(selected.id);
        }, help: "delete selected item" },
        { lhs: "p", callback: () => {
          focusEntryComposer();
          navigator.clipboard.readText().then((text) => {
            if (text) setEntryBody(prev => prev + text);
          }).catch(() => {});
        }, help: "paste into new bookmark" },
    {
      lhs: Array.from({ length: 9 }, (_, i) => String(i + 1)),
      callback: ({ lhs }) => {
        const index = Number(lhs) - 1;
        if (index < paginatedEntries().length) {
          setActiveIndex(index);
          scrollActiveIntoView();
        }
      },
      help: "select item 1–9",
    },
  ]);

  const setPage = (page: number) => {
    const nextPage = Math.min(Math.max(page, 1), totalPages());
    setParams({ page: nextPage > 1 ? String(nextPage) : undefined });
    requestAnimationFrame(() => entryList?.scrollIntoView());
  };

  const hasMore = createMemo(() => currentPage() < totalPages());

  const saveEntry = async (body: string) => {
    if (!isEntryStoreReady()) return;

    setError(null);
    setIsSaving(true);

    try {
      await createEntry(body);
      setEntryBody("");
      mobileComposer?.close();
    } catch (err) {
      setError(err instanceof Error ? err.message : "Failed to save entry");
    } finally {
      setIsSaving(false);
    }
  };

  const handleSubmit = (event: SubmitEvent) => {
    event.preventDefault();
    void saveEntry(entryBody());
  };

  const handleClipboardSave = async () => {
    try {
      const clipboardText = (await navigator.clipboard.readText()).trim();
      if (isUrlOnlyInput(clipboardText)) {
        await saveEntry(clipboardText);
        return;
      }

      setEntryBody(clipboardText);
      setError(clipboardText ? "Clipboard has text, but no link. Edit it below." : "Clipboard is empty. Paste or write below.");
    } catch {
      setError("Clipboard access was blocked. Paste or write below.");
    }

    focusEntryComposer();
  };

  const handleDelete = async (entryId: string) => {
    if (!window.confirm("Delete this entry?")) {
      return;
    }

    setError(null);

    try {
      await deleteEntry(entryId);
    } catch (err) {
      setError(err instanceof Error ? err.message : "Failed to delete entry");
    }
  };

  return (
    <>
      <Title>{searchQuery() ? `${searchQuery()} | mark.tildom` : "mark.tildom"}</Title>

        <Show when={!searchQuery()}>
          <>
            <div class={`${styles.desktopComposer} hn-panel`}>
              <EntryComposer
                id="entry-body"
                value={entryBody()}
                error={error()}
                isSaving={isSaving()}
                onInput={setEntryBody}
                onSubmit={handleSubmit}
                onPasteLink={() => void handleClipboardSave()}
                textareaRef={(element) => {
                  desktopEntryTextarea = element;
                }}
              />
            </div>

            <div class={styles.mobileBar}>
              <Button type="button" onClick={focusEntryComposer}>
                add link
              </Button>
              <Button
                type="button"
                class={styles.mobilePaste}
                disabled={!isEntryStoreReady() || isSaving()}
                onClick={() => void handleClipboardSave()}
                aria-label="Save copied link"
                title="Save copied link"
              >
                <ClipboardPaste aria-hidden="true" />
              </Button>
            </div>

            <MobileEntryDialog
              value={entryBody()}
              error={error()}
              isSaving={isSaving()}
              onInput={setEntryBody}
              onSubmit={handleSubmit}
              onPasteLink={() => void handleClipboardSave()}
              dialogRef={(element) => {
                mobileComposer = element;
              }}
              textareaRef={(element) => {
                mobileEntryTextarea = element;
              }}
            />
          </>
        </Show>

        <Show
          when={isEntryStoreReady()}
          fallback={<StartupEntries />}
        >
          <div>
            <Show when={searchQuery()}>
              <p class={styles.feedNote}>
                Search results for <b>{searchQuery()}</b>. <a href="/">newest</a>
              </p>
            </Show>

            <Show when={searchQuery() && results.loading}>
              <p class={styles.feedNote}>Searching...</p>
            </Show>

            <Show when={!isEmpty()}>
              <ol ref={entryList} class={styles.entryList} start={pageStart() + 1} style={{ "--entry-count": pageStart() }}>
                <For each={paginatedEntries()}>
                  {(entry, index) => (
                    <li class={styles.entryItem}>
                      <EntryListItemPreview
                        entry={entry}
                        matchText={isSearchResult(entry) ? entry.matchText : undefined}
                        searchQuery={searchQuery()}
                        onDelete={handleDelete}
                        isActive={index() === activeIndex()}
                      />
                    </li>
                  )}
                </For>
              </ol>
            </Show>

            <Show when={isEmpty()}>
              <p class={styles.feedNote}>
                {searchQuery() ? "No local matches." : "No links yet."}
              </p>
            </Show>

            <Show when={hasMore()}>
              <nav class={styles.pagination} aria-label="Pagination">
                <Button
                  type="button"
                  onClick={() => setPage(currentPage() + 1)}
                >
                  More
                </Button>
              </nav>
            </Show>
          </div>
        </Show>
      </>
  );
}
