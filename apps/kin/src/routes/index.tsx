import { Show, For, createSignal, createEffect, onMount, onCleanup } from "solid-js";
import { useSearchParams, useNavigate } from "@solidjs/router";
import AppNav from "~/components/AppNav";
import { getSharedPreferences } from "@tildom/ui";
import {
  contacts,
  isContactStoreReady,
  searchQuery,
  setSearchQuery,
  createContact,
  deleteContact
} from "~/stores/contactStore";
import { Plus } from "lucide-solid";

export default function Home() {
  const [params] = useSearchParams();
  const navigate = useNavigate();

  // Vim Keybindings Navigation index
  const [vimIndex, setVimIndex] = createSignal(0);
  const [isQuickAdding, setIsQuickAdding] = createSignal(false);
  const [quickAddName, setQuickAddName] = createSignal("");
  let quickAddInputRef!: HTMLInputElement;

  // Reactively track URL parameter changes to filter search store
  createEffect(() => {
    const q = String(params.q ?? "");
    setSearchQuery(q);
  });

  // Clamp selection index bounds
  createEffect(() => {
    const list = contacts();
    if (vimIndex() >= list.length) {
      setVimIndex(Math.max(0, list.length - 1));
    }
  });

  // Vim keyboard navigation for the directory list
  onMount(() => {
    let lastKey = "";
    const isVimEnabled = getSharedPreferences().vimKeys;

    const handleKeyDown = (event: KeyboardEvent) => {
      const isDesktop = !("ontouchstart" in window) && window.innerWidth > 768;
      if (!isDesktop || !isVimEnabled) return;

      const activeEl = document.activeElement;
      const isTyping = activeEl && (activeEl.tagName === "INPUT" || activeEl.tagName === "TEXTAREA" || activeEl.tagName === "SELECT");

      if (isTyping) {
        if (event.key === "Escape") {
          (activeEl as HTMLElement).blur();
          event.preventDefault();
        }
        return;
      }

      const key = event.key;
      const list = contacts();

      // Buffer Tab Shifts
      if (lastKey === "g" && (key === "t" || key === "T")) {
        event.preventDefault();
        lastKey = "";
        navigate("/settings");
        return;
      }
      if (key === "g") {
        lastKey = "g";
        setTimeout(() => { if (lastKey === "g") lastKey = ""; }, 1000);
      }

      // gg (top) & G (bottom)
      if (key === "g" && event.shiftKey === false) {
        if (lastKey === "g") {
          event.preventDefault();
          setVimIndex(0);
          lastKey = "";
          scrollToActiveRow();
        }
        return;
      }
      if (key === "G") {
        event.preventDefault();
        setVimIndex(Math.max(0, list.length - 1));
        scrollToActiveRow();
        return;
      }

      // cursor movement j / k
      if (key === "j") {
        event.preventDefault();
        setVimIndex(prev => Math.min(list.length - 1, prev + 1));
        scrollToActiveRow();
        return;
      }
      if (key === "k") {
        event.preventDefault();
        setVimIndex(prev => Math.max(0, prev - 1));
        scrollToActiveRow();
        return;
      }

      // Open detailed view: Enter or e
      if (key === "Enter" || key === "e") {
        event.preventDefault();
        if (list[vimIndex()]) {
          navigate(`/person/${list[vimIndex()].id}`);
        }
        return;
      }

      // Focus search: /
      if (key === "/") {
        event.preventDefault();
        const searchInput = document.getElementById("search-input") as HTMLInputElement;
        if (searchInput) {
          searchInput.focus();
          searchInput.select();
        }
        return;
      }

      // Focus Quick Add: i
      if (key === "i") {
        event.preventDefault();
        setIsQuickAdding(true);
        setTimeout(() => { if (quickAddInputRef) quickAddInputRef.focus(); }, 50);
        return;
      }

      // Delete highlighted contact: d
      if (key === "d") {
        const target = list[vimIndex()];
        if (target) {
          const confirmDelete = window.confirm(`Delete ${target.name}? This will remove all notes and relationship connections.`);
          if (confirmDelete) {
            void deleteContact(target.id);
          }
        }
        return;
      }
    };

    window.addEventListener("keydown", handleKeyDown);
    onCleanup(() => {
      window.removeEventListener("keydown", handleKeyDown);
    });
  });

  const scrollToActiveRow = () => {
    setTimeout(() => {
      const activeEl = document.querySelector(".tui-list-row.active-row");
      if (activeEl) {
        activeEl.scrollIntoView({ block: "nearest", behavior: "smooth" });
      }
    }, 10);
  };

  const handleQuickAdd = async (e: Event) => {
    e.preventDefault();
    const name = quickAddName().trim();
    if (!name) return;

    try {
      const newId = await createContact(name);
      setQuickAddName("");
      setIsQuickAdding(false);
      navigate(`/person/${newId}`);
    } catch (err) {
      alert("Failed to add contact.");
    }
  };

  const isVimEnabled = () => getSharedPreferences().vimKeys;

  return (
    <div class="tui-page">
      <AppNav active="people" />

      <main class="tui-content">
        <Show when={!isContactStoreReady()}>
          <div class="tui-empty">
            <span class="vim-cursor">█</span> Initializing SQLite OPFS Storage...
          </div>
        </Show>

        <Show when={isContactStoreReady()}>
          <div class="tui-panel" style="max-width: 80ch; margin: 0 auto; width: 100%;">
            <h2 class="tui-panel-heading">Directory</h2>

            <Show when={contacts().length === 0}>
              <div class="tui-empty" style="margin-bottom: 1.5rem;">
                {searchQuery() ? "No results match query." : "Your personal relationship list is empty."}
              </div>
            </Show>

            <Show when={contacts().length > 0}>
              <ul class="tui-list" style="margin-bottom: 1.5rem;">
                <For each={contacts()}>
                  {(contact, index) => (
                    <li class="tui-list-item">
                      <div
                        class="tui-list-row"
                        classList={{
                          "active-row": isVimEnabled() && vimIndex() === index()
                        }}
                        onClick={() => {
                          setVimIndex(index());
                          navigate(`/person/${contact.id}`);
                        }}
                      >
                        <div class="tui-list-title">
                          <Show when={isVimEnabled() && vimIndex() === index()}>
                            <span class="vim-cursor">█</span>
                          </Show>
                          {contact.name}
                        </div>
                        <Show when={contact.location || contact.email}>
                          <div class="tui-list-sub">
                            {contact.location && `📍 ${contact.location}`}
                            {contact.location && contact.email && " | "}
                            {contact.email && `✉ ${contact.email}`}
                          </div>
                        </Show>
                      </div>
                    </li>
                  )}
                </For>
              </ul>
            </Show>

            {/* Quick Add block */}
            <div class="tui-inline-add">
              <Show when={!isQuickAdding()}>
                <div class="tui-inline-trigger" onClick={() => {
                  setIsQuickAdding(true);
                  setTimeout(() => { if (quickAddInputRef) quickAddInputRef.focus(); }, 50);
                }}>
                  <Plus size={14} /> [+] Add Person
                </div>
              </Show>

              <Show when={isQuickAdding()}>
                <form onSubmit={handleQuickAdd}>
                  <div style="display: flex; gap: 1ch; align-items: center; flex-wrap: wrap;">
                    <span style="font-weight: bold; color: var(--syntax-keyword);">❯ Name:</span>
                    <input
                      ref={quickAddInputRef}
                      type="text"
                      class="tui-input"
                      style="padding: 4px 8px; border: 1px solid var(--border-color); flex: 1; min-width: 150px;"
                      placeholder="Name..."
                      value={quickAddName()}
                      onInput={(e) => setQuickAddName(e.currentTarget.value)}
                      onBlur={() => {
                        if (!quickAddName()) setIsQuickAdding(false);
                      }}
                    />
                    <button type="submit" class="tui-btn" style="min-height: 32px; padding: 0 1.5ch;">Save</button>
                    <button
                      type="button"
                      class="tui-btn"
                      style="min-height: 32px; padding: 0 1ch; border-color: var(--syntax-error); color: var(--syntax-error);"
                      onClick={() => setIsQuickAdding(false)}
                    >
                      Cancel
                    </button>
                  </div>
                </form>
              </Show>
            </div>
          </div>
        </Show>
      </main>
    </div>
  );
}
