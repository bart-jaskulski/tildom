import { Title } from "@solidjs/meta";
import { useNavigate, useSearchParams } from "@solidjs/router";
import { For, Show, createEffect, createMemo, createResource, createSignal, onMount } from "solid-js";
import { isServer } from "solid-js/web";
import { createVimNavigation } from "@tildom/ui";
import AppNav from "~/components/AppNav";
import EntryCard from "~/components/EntryCard";
import { dbVersion } from "~/lib/db";
import type { Entry, SearchResult } from "~/lib/entries";
import { searchLocalEntries } from "~/lib/searchIndex";
import { handleTextareaKeyboardSubmit, resizeTextareaToFitContent } from "~/lib/textarea";
import { createEntry, deleteEntry, entries, isEntryStoreReady } from "~/stores/entryStore";

const PAGE_SIZE = 20;

const isSearchResult = (entry: Entry | SearchResult): entry is SearchResult => "matchText" in entry;

const parsePage = (value: unknown) => {
  const page = Number(value);
  return Number.isInteger(page) && page > 0 ? page : 1;
};

export default function Home() {
  const [params, setParams] = useSearchParams();
  const [entryBody, setEntryBody] = createSignal("");
  let entryBodyTextarea: HTMLTextAreaElement | undefined;
  const [error, setError] = createSignal<string | null>(null);
  const [isSaving, setIsSaving] = createSignal(false);
  const searchQuery = createMemo(() => String(params.q ?? "").trim());
  const [results] = createResource(
    () => (!isServer && isEntryStoreReady() && searchQuery() ? [searchQuery(), dbVersion()] as const : null),
    ([query]) => searchLocalEntries(query),
  );
  const visibleEntries = createMemo(() => searchQuery() ? results() ?? [] : entries());
  const isEmpty = createMemo(() => isEntryStoreReady() && !results.loading && visibleEntries().length === 0);
  const requestedPage = createMemo(() => parsePage(params.page));
  const totalPages = createMemo(() => Math.max(1, Math.ceil(visibleEntries().length / PAGE_SIZE)));
  const currentPage = createMemo(() => Math.min(requestedPage(), totalPages()));
  const pageStart = createMemo(() => (currentPage() - 1) * PAGE_SIZE);
  const paginatedEntries = createMemo(() => visibleEntries().slice(pageStart(), pageStart() + PAGE_SIZE));
  const navigate = useNavigate();
  const [activeIndex, setActiveIndex] = createSignal(0);
  const hasPagination = createMemo(() => visibleEntries().length > PAGE_SIZE);

  createEffect(() => {
    const max = paginatedEntries().length - 1;
    if (activeIndex() > max) {
      setActiveIndex(Math.max(0, max));
    }
  });

  onMount(() => {
    const scrollActiveIntoView = () => {
      requestAnimationFrame(() => {
        const activeRowEl = document.querySelector('.entry-row.active-row');
        if (activeRowEl) {
          activeRowEl.scrollIntoView({ block: 'center', behavior: 'smooth' });
        }
      });
    };

    createVimNavigation({
      onDown: () => {
        setActiveIndex(prev => Math.min(prev + 1, paginatedEntries().length - 1));
        scrollActiveIntoView();
      },
      onUp: () => {
        setActiveIndex(prev => Math.max(prev - 1, 0));
        scrollActiveIntoView();
      },
      onSearch: () => {
        const searchInput = document.querySelector('.hn-search input') as HTMLInputElement;
        if (searchInput) {
          searchInput.focus();
          searchInput.select();
        }
      },
      onFocusInput: () => {
        if (entryBodyTextarea) {
          entryBodyTextarea.focus();
        }
      },
      onSave: () => {
        if (entryBody()) {
          void handleSubmit(new Event("submit") as any);
        }
      },
      customCommands: {
        t: (lastKey) => {
          if (lastKey === "g") navigate("/settings");
        },
        T: (lastKey) => {
          if (lastKey === "g") navigate("/settings");
        },
        x: (lastKey) => {
          if (lastKey === "g") {
            const selected = paginatedEntries()[activeIndex()];
            if (selected && selected.canonicalUrl) {
              window.open(selected.canonicalUrl, "_blank", "noreferrer");
            }
          }
        },
        g: (lastKey) => {
          if (lastKey === "g") {
            setActiveIndex(0);
            scrollActiveIntoView();
          }
        },
        G: () => {
          setActiveIndex(paginatedEntries().length - 1);
          scrollActiveIntoView();
        },
        h: () => {
          window.history.back();
        },
        l: () => {
          window.history.forward();
        },
        e: () => {
          const selected = paginatedEntries()[activeIndex()];
          if (selected) {
            navigate(`/item/${selected.id}`);
          }
        },
        Enter: () => {
          const selected = paginatedEntries()[activeIndex()];
          if (selected) {
            navigate(`/item/${selected.id}`);
          }
        },
        o: () => {
          const selected = paginatedEntries()[activeIndex()];
          if (selected && selected.canonicalUrl) {
            window.open(selected.canonicalUrl, "_blank", "noreferrer");
          }
        },
        d: () => {
          const selected = paginatedEntries()[activeIndex()];
          if (selected) {
            void handleDelete(selected.id);
          }
        },
        p: () => {
          if (entryBodyTextarea) {
            entryBodyTextarea.focus();
            navigator.clipboard.readText().then((text) => {
              if (text) {
                setEntryBody(prev => prev + text);
              }
            }).catch(() => {});
          }
        },
        ...Object.fromEntries(
          Array.from({ length: 9 }, (_, i) => [
            String(i + 1),
            () => {
              if (i < paginatedEntries().length) {
                setActiveIndex(i);
                scrollActiveIntoView();
              }
            }
          ])
        )
      }
    });
  });

  createEffect(() => {
    entryBody();
    if (entryBodyTextarea) {
      resizeTextareaToFitContent(entryBodyTextarea);
    }
  });

  const setPage = (page: number) => {
    const nextPage = Math.min(Math.max(page, 1), totalPages());
    setParams({ page: nextPage > 1 ? String(nextPage) : undefined });
  };

  const hasMore = createMemo(() => currentPage() < totalPages());

  const handleSubmit = async (event: SubmitEvent) => {
    event.preventDefault();
    setError(null);
    setIsSaving(true);

    try {
      await createEntry(entryBody());
      setEntryBody("");
    } catch (err) {
      setError(err instanceof Error ? err.message : "Failed to save entry");
    } finally {
      setIsSaving(false);
    }
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
    <main class="hn-page">
      <Title>{searchQuery() ? `${searchQuery()} | mark.tildom` : "mark.tildom"}</Title>
      <AppNav />

      <section class="hn-content hn-stack">
        <form id="submit" class="hn-form hn-panel" onSubmit={handleSubmit}>
          <div class="hn-form-row">
            <label class="hn-label visually-hidden" for="entry-body">save</label>
            <textarea
              id="entry-body"
              ref={(element) => {
                entryBodyTextarea = element;
                resizeTextareaToFitContent(element);
              }}
              value={entryBody()}
              onInput={(event) => {
                setEntryBody(event.currentTarget.value);
                resizeTextareaToFitContent(event.currentTarget);
              }}
              onKeyDown={handleTextareaKeyboardSubmit}
              rows={5}
              placeholder="Paste a link or write a note"
              class="hn-textarea"
            />
          </div>

          <Show when={error()}>
            <p class="hn-error">{error()}</p>
          </Show>

          <div class="hn-form-row">
            <span />
            <button type="submit" disabled={isSaving()} class="hn-button">
              {isSaving() ? "saving..." : "save"}
            </button>
          </div>
        </form>

        <div>
          <Show when={!isEntryStoreReady()}>
            <p class="hn-status">Opening local database...</p>
          </Show>

          <Show when={searchQuery()}>
            <p class="hn-feed-note">
              Search results for <b>{searchQuery()}</b>. <a href="/">newest</a>
            </p>
          </Show>

          <Show when={searchQuery() && results.loading}>
            <p class="hn-feed-note">Searching...</p>
          </Show>

          <Show when={!isEmpty()}>
            <ol class="entry-list" start={pageStart() + 1}>
              <For each={paginatedEntries()}>
                {(entry, index) => (
                  <li class="entry-item">
                    <EntryCard
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
            <p class="hn-feed-note">
              {searchQuery() ? "No local matches." : "No links yet."}
            </p>
          </Show>

          <Show when={hasMore()}>
            <nav class="hn-pagination" aria-label="Pagination">
              <button
                type="button"
                class="hn-button"
                onClick={() => setPage(currentPage() + 1)}
              >
                More
              </button>
            </nav>
          </Show>
        </div>
      </section>
    </main>
  );
}
