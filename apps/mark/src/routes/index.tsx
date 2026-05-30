import { Title } from "@solidjs/meta";
import { useNavigate, useSearchParams } from "@solidjs/router";
import { For, Show, createEffect, createMemo, createResource, createSignal, onMount, onCleanup } from "solid-js";
import { isServer } from "solid-js/web";
import AppNav from "~/components/AppNav";
import EntryCard from "~/components/EntryCard";
import { dbVersion } from "~/lib/db";
import type { Entry, SearchResult } from "~/lib/entries";
import { searchLocalEntries } from "~/lib/searchIndex";
import { handleTextareaKeyboardSubmit, resizeTextareaToFitContent } from "~/lib/textarea";
import { createEntry, deleteEntry, entries, isEntryStoreReady } from "~/stores/entryStore";

const PAGE_SIZE = 20;

const isSearchResult = (entry: Entry | SearchResult): entry is SearchResult => "matchLabel" in entry;

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
    let lastKey = "";

    const scrollActiveIntoView = () => {
      requestAnimationFrame(() => {
        const activeRowEl = document.querySelector('.entry-row.active-row');
        if (activeRowEl) {
          activeRowEl.scrollIntoView({ block: 'center', behavior: 'smooth' });
        }
      });
    };

    const handleKeyDown = (event: KeyboardEvent) => {
      const isDesktop = !('ontouchstart' in window) && window.innerWidth > 768;
      const isVimEnabled = localStorage.getItem("vim-keybinds") !== "false";
      if (!isDesktop || !isVimEnabled) return;

      const activeEl = document.activeElement;
      const isTyping = activeEl && (activeEl.tagName === "INPUT" || activeEl.tagName === "TEXTAREA");

      if (isTyping) {
        if (event.key === "Escape") {
          (activeEl as HTMLElement).blur();
          event.preventDefault();
        }
        return;
      }

      const key = event.key;

      if (key === "Escape") {
        lastKey = "";
        event.preventDefault();
        return;
      }

      // Search trigger: /
      if (key === "/") {
        const searchInput = document.querySelector('.hn-search input') as HTMLInputElement;
        if (searchInput) {
          event.preventDefault();
          searchInput.focus();
          searchInput.select();
        }
        return;
      }

      // Insert mode: i
      if (key === "i") {
        event.preventDefault();
        if (entryBodyTextarea) {
          entryBodyTextarea.focus();
        }
        return;
      }

      // Paste action: p
      if (key === "p") {
        event.preventDefault();
        if (entryBodyTextarea) {
          entryBodyTextarea.focus();
          navigator.clipboard.readText().then((text) => {
            if (text) {
              setEntryBody(prev => prev + text);
            }
          }).catch(() => {});
        }
        return;
      }

      // Tab navigation: gt / gT (goes to settings from main)
      if (lastKey === "g" && (key === "t" || key === "T")) {
        event.preventDefault();
        lastKey = "";
        navigate("/settings");
        return;
      }

      // Open URL sequence: gx
      if (lastKey === "g" && key === "x") {
        event.preventDefault();
        lastKey = "";
        const selected = paginatedEntries()[activeIndex()];
        if (selected && selected.canonicalUrl) {
          window.open(selected.canonicalUrl, "_blank", "noreferrer");
        }
        return;
      }

      // First line jump sequence: gg
      if (lastKey === "g" && key === "g") {
        event.preventDefault();
        lastKey = "";
        setActiveIndex(0);
        scrollActiveIntoView();
        return;
      }

      // g prefix detection
      if (key === "g") {
        lastKey = "g";
        setTimeout(() => { if (lastKey === "g") lastKey = ""; }, 1000);
        return;
      }

      // Save command: :w
      if (lastKey === ":" && key === "w") {
        event.preventDefault();
        lastKey = "";
        if (entryBody()) {
          void handleSubmit(new Event("submit") as any);
        }
        return;
      }

      // : prefix detection
      if (key === ":") {
        lastKey = ":";
        setTimeout(() => { if (lastKey === ":") lastKey = ""; }, 1000);
        return;
      }

      // History back/forth: h / l
      if (key === "h") {
        event.preventDefault();
        window.history.back();
        return;
      }
      if (key === "l") {
        event.preventDefault();
        window.history.forward();
        return;
      }

      // List navigation: j / ArrowDown
      if (key === "j" || key === "ArrowDown") {
        event.preventDefault();
        setActiveIndex(prev => Math.min(prev + 1, paginatedEntries().length - 1));
        scrollActiveIntoView();
        return;
      }

      // List navigation: k / ArrowUp
      if (key === "k" || key === "ArrowUp") {
        event.preventDefault();
        setActiveIndex(prev => Math.max(prev - 1, 0));
        scrollActiveIntoView();
        return;
      }

      // Last line jump: G
      if (key === "G") {
        event.preventDefault();
        setActiveIndex(paginatedEntries().length - 1);
        scrollActiveIntoView();
        return;
      }

      // Number selections (1-9) to jump to line numbers!
      if (/^[1-9]$/.test(key)) {
        const index = Number(key) - 1;
        if (index < paginatedEntries().length) {
          event.preventDefault();
          setActiveIndex(index);
          scrollActiveIntoView();
        }
        return;
      }

      // Open selected item: e or Enter
      if (key === "e" || key === "Enter") {
        const selected = paginatedEntries()[activeIndex()];
        if (selected) {
          event.preventDefault();
          navigate(`/item/${selected.id}`);
        }
        return;
      }

      // Open canonical URL: o
      if (key === "o") {
        const selected = paginatedEntries()[activeIndex()];
        if (selected && selected.canonicalUrl) {
          event.preventDefault();
          window.open(selected.canonicalUrl, "_blank", "noreferrer");
        }
        return;
      }

      // Delete selected item: d
      if (key === "d") {
        const selected = paginatedEntries()[activeIndex()];
        if (selected) {
          event.preventDefault();
          void handleDelete(selected.id);
        }
        return;
      }
    };

    window.addEventListener("keydown", handleKeyDown);
    onCleanup(() => {
      window.removeEventListener("keydown", handleKeyDown);
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
                      matchLabel={isSearchResult(entry) ? entry.matchLabel : undefined}
                      matchText={isSearchResult(entry) ? entry.matchText : undefined}
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
