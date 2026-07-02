import { Show, createSignal, onMount, onCleanup } from "solid-js";
import { useNavigate } from "@solidjs/router";
import AppNav from "~/components/AppNav";
import { exportDatabase, importDatabase } from "~/lib/db";
import { Download, Upload } from "lucide-solid";
import { createPreferences, getSharedPreferences } from "@tildom/ui";

export default function Settings() {
  const navigate = useNavigate();

  const [status, setStatus] = createSignal<string | null>(null);
  const [error, setError] = createSignal<string | null>(null);
  const [isExporting, setIsExporting] = createSignal(false);
  const [isImporting, setIsImporting] = createSignal(false);
  const [prefs, setPrefs] = createPreferences();
  
  let fileInputRef!: HTMLInputElement;

  // Settings-specific Vim hotkeys
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

      // Esc: return to index
      if (key === "Escape") {
        event.preventDefault();
        navigate("/");
        return;
      }

      // Buffer Tab Shifts
      if (lastKey === "g" && (key === "t" || key === "T")) {
        event.preventDefault();
        lastKey = "";
        navigate("/");
        return;
      }
      if (key === "g") {
        lastKey = "g";
        setTimeout(() => { if (lastKey === "g") lastKey = ""; }, 1000);
      }
    };

    window.addEventListener("keydown", handleKeyDown);
    onCleanup(() => {
      window.removeEventListener("keydown", handleKeyDown);
    });
  });

  const handleExport = async () => {
    setStatus(null);
    setError(null);
    setIsExporting(true);

    try {
      const bytes = await exportDatabase();
      const backup = new Uint8Array(bytes);
      const url = URL.createObjectURL(new Blob([backup.buffer], { type: "application/vnd.sqlite3" }));
      const anchor = document.createElement("a");
      anchor.href = url;
      anchor.download = `kin-backup-${new Date().toISOString().slice(0, 10)}.sqlite3`;
      anchor.click();
      URL.revokeObjectURL(url);
      setStatus("Database export successful.");
    } catch (err) {
      setError(err instanceof Error ? err.message : "Failed to export database");
    } finally {
      setIsExporting(false);
    }
  };

  const handleImport = async (event: Event) => {
    const file = (event.currentTarget as HTMLInputElement).files?.[0];
    if (!file) return;

    const confirmImport = window.confirm("Import this SQLite database? It will COMPLETELY OVERWRITE your current local database.");
    if (!confirmImport) {
      if (fileInputRef) fileInputRef.value = "";
      return;
    }

    setStatus(null);
    setError(null);
    setIsImporting(true);

    try {
      await importDatabase(new Uint8Array(await file.arrayBuffer()));
      setStatus("Database import completed successfully.");
    } catch (err) {
      setError(err instanceof Error ? err.message : "Failed to import database");
    } finally {
      setIsImporting(false);
      if (fileInputRef) fileInputRef.value = "";
    }
  };

  const toggleVim = () => {
    setPrefs(prev => ({ ...prev, vimKeys: !prev.vimKeys }));
  };

  return (
    <div class="tui-page">
      <AppNav active="settings" />

      <main class="tui-content">
        <div class="tui-panel" style="max-width: 80ch; margin: 0 auto; width: 100%;">
          <h2 class="tui-panel-heading">Settings</h2>

          {/* Vim keyboard binds toggles */}
          <div class="tui-settings-item">
            <h3 style="margin: 0 0 0.5rem; font-size: 14px; font-weight: bold;">VIM NORMAL MODE KEYBOARD NAVIGATION</h3>
            <p class="tui-muted" style="margin: 0 0 1rem; font-size: 13px;">
              Enables rapid Neovim-style desktop navigation using standard commands:
              <br />
              <code style="background: var(--bg-canvas); padding: 2px 4px; font-size: 12px;">j</code> / <code style="background: var(--bg-canvas); padding: 2px 4px; font-size: 12px;">k</code> to scroll contacts list,
              <code style="background: var(--bg-canvas); padding: 2px 4px; font-size: 12px;">e</code> or <code style="background: var(--bg-canvas); padding: 2px 4px; font-size: 12px;">Enter</code> to open contact drawer,
              <code style="background: var(--bg-canvas); padding: 2px 4px; font-size: 12px;">Esc</code> to close buffers or go back,
              <code style="background: var(--bg-canvas); padding: 2px 4px; font-size: 12px;">/</code> to search,
              <code style="background: var(--bg-canvas); padding: 2px 4px; font-size: 12px;">i</code> to write note.
            </p>

            <label style="display: inline-flex; align-items: center; gap: 1ch; cursor: pointer; user-select: none; font-weight: bold; font-size: 14px;">
              <input
                type="checkbox"
                checked={prefs().vimKeys}
                onChange={toggleVim}
                style="display: none;"
              />
              <span>{prefs().vimKeys ? "[x]" : "[ ]"} ENABLE VIM KEYBINDINGS (DESKTOP)</span>
            </label>
          </div>

          {/* Database Export/Import */}
          <div class="tui-settings-item">
            <h3 style="margin: 0 0 0.5rem; font-size: 14px; font-weight: bold;">LOCAL DATABASE PORTABILITY (SQLITE)</h3>
            <p class="tui-muted" style="margin: 0 0 1.25rem; font-size: 13px;">
              Backup your personal relationship records by downloading the complete, binary SQLite database directly out of the browser OPFS file storage, or import a previously exported database.
            </p>

            <div style="display: flex; flex-wrap: wrap; gap: 2ch;">
              <button
                type="button"
                class="tui-btn"
                onClick={handleExport}
                disabled={isExporting() || isImporting()}
              >
                <Download size={14} style="margin-right: 1ch;" />
                {isExporting() ? "exporting..." : "export database"}
              </button>

              <label class="tui-btn tui-file-btn">
                <Upload size={14} style="margin-right: 1ch;" />
                <input
                  ref={fileInputRef}
                  type="file"
                  accept=".sqlite,.sqlite3,.db,application/vnd.sqlite3"
                  disabled={isExporting() || isImporting()}
                  onChange={handleImport}
                />
                {isImporting() ? "importing..." : "import database"}
              </label>
            </div>

            <Show when={status()}>
              <div class="tui-status-box" role="status">
                {status()}
              </div>
            </Show>

            <Show when={error()}>
              <div class="tui-error-box" role="alert">
                {error()}
              </div>
            </Show>
          </div>
        </div>
      </main>
    </div>
  );
}
