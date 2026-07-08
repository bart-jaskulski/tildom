import { Title } from "@solidjs/meta";
import { A, useNavigate } from "@solidjs/router";
import { Show, createSignal, onMount } from "solid-js";
import { createVimNavigation, createPreferences } from "@tildom/ui";
import AppNav from "~/components/AppNav";
import { exportDatabase, importDatabase } from "~/lib/db";
import { syncSignals } from "~/lib/syncClient";
import { markSyncDirty } from "~/lib/syncState";

const createBackupFilename = () => {
  const date = new Date().toISOString().slice(0, 10);
  return `mark-tildom-${date}.sqlite3`;
};

export default function Settings() {
  const [status, setStatus] = createSignal<string | null>(null);
  const [error, setError] = createSignal<string | null>(null);
  const [isExporting, setIsExporting] = createSignal(false);
  const [isImporting, setIsImporting] = createSignal(false);
  const [prefs, setPrefs] = createPreferences();
  const navigate = useNavigate();
  let fileInput!: HTMLInputElement;

  onMount(() => {
    createVimNavigation({
      onEscape: () => {
        navigate("/");
      },
      onSearch: () => {
        const searchInput = document.querySelector('.hn-search input') as HTMLInputElement;
        if (searchInput) {
          searchInput.focus();
          searchInput.select();
        }
      },
      customCommands: {
        t: (lastKey) => {
          if (lastKey === "g") navigate("/");
        },
        T: (lastKey) => {
          if (lastKey === "g") navigate("/");
        },
        h: () => {
          window.history.back();
        },
        l: () => {
          window.history.forward();
        }
      }
    });
  });

  const toggleVim = () => {
    setPrefs(prev => ({ ...prev, vimKeys: !prev.vimKeys }));
  };

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
      anchor.download = createBackupFilename();
      anchor.click();
      URL.revokeObjectURL(url);
      setStatus("Database export started.");
    } catch (err) {
      setError(err instanceof Error ? err.message : "Failed to export database");
    } finally {
      setIsExporting(false);
    }
  };

  const handleImport = async (event: Event) => {
    const file = (event.currentTarget as HTMLInputElement).files?.[0];
    if (!file) {
      return;
    }

    const shouldImport = window.confirm(
      "Import this database backup? It will replace the current local database.",
    );
    if (!shouldImport) {
      if (fileInput) {
        fileInput.value = "";
      }
      return;
    }

    setStatus(null);
    setError(null);
    setIsImporting(true);

    try {
      await importDatabase(new Uint8Array(await file.arrayBuffer()));
      await markSyncDirty();
      setStatus("Database imported.");
    } catch (err) {
      setError(err instanceof Error ? err.message : "Failed to import database");
    } finally {
      setIsImporting(false);
      if (fileInput) {
        fileInput.value = "";
      }
    }
  };

  return (
    <main class="hn-page">
      <Title>Settings | mark.tildom</Title>
      <AppNav active="settings" />

      <section class="hn-content hn-stack">
        <div class="hn-panel hn-stack settings-panel">
          <div>
            <h1 class="hn-heading">Settings</h1>
            <p class="hn-muted">Import or export the local SQLite database.</p>
          </div>

          <div class="hn-form-row">
            <label class="settings-checkbox">
              <input
                type="checkbox"
                checked={prefs().vimKeys}
                onChange={toggleVim}
              />
              <span>
                {prefs().vimKeys ? "[x]" : "[ ]"} ENABLE VIM KEYBINDINGS (DESKTOP ONLY)
              </span>
            </label>
          </div>

          <div class="settings-actions">
            <button type="button" class="hn-button" onClick={handleExport} disabled={isExporting() || isImporting()}>
              {isExporting() ? "exporting..." : "export database"}
            </button>

            <label class="hn-button settings-file-button">
              <input
                ref={fileInput}
                type="file"
                accept=".sqlite,.sqlite3,.db,application/vnd.sqlite3,application/x-sqlite3"
                disabled={isExporting() || isImporting()}
                onChange={handleImport}
              />
              {isImporting() ? "importing..." : "import database"}
            </label>
          </div>

          <Show when={status()}>
            <p class="hn-status" role="status">{status()}</p>
          </Show>

          <Show when={error()}>
            <p class="hn-error" role="alert">{error()}</p>
          </Show>
        </div>

        <div class="hn-panel hn-stack settings-panel">
          <div>
            <h2 class="hn-heading">Sync</h2>
            <p class="hn-muted">Encrypted snapshot sync for this database.</p>
          </div>

          <dl class="sync-status">
            <div>
              <dt>state</dt>
              <dd>{syncSignals.isPaired() ? syncSignals.statusText() : "unpaired"}</dd>
            </div>
            <div>
              <dt>revision</dt>
              <dd>{syncSignals.lastSeenRevision() ?? "none"}</dd>
            </div>
            <div>
              <dt>local</dt>
              <dd>{syncSignals.hasLocalChanges() ? "pending changes" : "clean"}</dd>
            </div>
          </dl>

          <div class="settings-actions">
            <A href="/pair" class="hn-button">
              open sync
            </A>
          </div>
        </div>
      </section>
    </main>
  );
}
