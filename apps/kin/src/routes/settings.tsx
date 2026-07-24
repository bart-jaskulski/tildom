import { Show, createSignal } from "solid-js";
import { createPreferences } from "@tildom/ui";
import AppNav from "~/components/AppNav";
import SyncSettings from "~/components/SyncSettings";
import { exportDatabase, importDatabase } from "~/lib/db";
import styles from "./settings.module.css";
import { markSyncDirty } from "~/lib/syncState";
import { pwaInstall } from "~/lib/pwaInstall";

export default function Settings() {
  const [status, setStatus] = createSignal<string | null>(null);
  const [error, setError] = createSignal<string | null>(null);
  const [busy, setBusy] = createSignal<"export" | "import" | null>(null);
  const [preferences, setPreferences] = createPreferences();
  let fileInput: HTMLInputElement | undefined;

  const exportBackup = async () => {
    setStatus(null); setError(null); setBusy("export");
    try {
      const bytes = await exportDatabase();
      const url = URL.createObjectURL(new Blob([new Uint8Array(bytes).buffer], { type: "application/vnd.sqlite3" }));
      Object.assign(document.createElement("a"), {
        href: url,
        download: `kin-tildom-${new Date().toISOString().slice(0, 10)}.sqlite3`,
      }).click();
      URL.revokeObjectURL(url);
      setStatus("Database export started.");
    } catch (nextError) {
      setError(nextError instanceof Error ? nextError.message : "Failed to export database.");
    } finally { setBusy(null); }
  };

  const importBackup = async (event: Event) => {
    const file = (event.currentTarget as HTMLInputElement).files?.[0];
    if (!file) return;
    if (!window.confirm("Import this database backup? It will replace the current local database.")) {
      if (fileInput) fileInput.value = "";
      return;
    }
    setStatus(null); setError(null); setBusy("import");
    try {
      await importDatabase(new Uint8Array(await file.arrayBuffer()));
      await markSyncDirty();
      setStatus("Database imported.");
    } catch (nextError) {
      setError(nextError instanceof Error ? nextError.message : "Failed to import database.");
    } finally {
      setBusy(null);
      if (fileInput) fileInput.value = "";
    }
  };

  return (
    <main class="kin-page">
      <AppNav active="settings" />
      <section class={`kin-content ${styles.panel}`}>
        <Show when={pwaInstall.available() || pwaInstall.needsSafariInstructions()}>
          <section class={styles.section}>
            <h1>Install</h1>
            <Show when={pwaInstall.available()}>
              <button type="button" class="kin-button" onClick={() => void pwaInstall.prompt()}>install kin</button>
            </Show>
            <Show when={!pwaInstall.available() && pwaInstall.needsSafariInstructions()}>
              <p>In Safari, use Share → Add to Home Screen.</p>
            </Show>
          </section>
        </Show>
        <section class={styles.section}>
          <h1>Keyboard</h1>
          <label class={styles.checkbox}>
            <input
              type="checkbox"
              checked={preferences().vimKeys}
              onChange={() => setPreferences((current) => ({ ...current, vimKeys: !current.vimKeys }))}
            />
            <span>{preferences().vimKeys ? "[x]" : "[ ]"} enable Vim keys</span>
          </label>
          <p>Wide screens with a hardware keyboard. Use <kbd>j</kbd>/<kbd>k</kbd> to move, <kbd>e</kbd> to open, <kbd>/</kbd> to search, <kbd>i</kbd> to write, and <kbd>Esc</kbd> to return.</p>
        </section>

        <SyncSettings />

        <section class={styles.section}>
          <h2>Database</h2>
          <p>Kin stays local in this browser. Export the complete SQLite database as a backup, or replace it with a previous export.</p>
          <div class={styles.actions}>
            <button type="button" class="kin-button" disabled={busy() !== null} onClick={exportBackup}>
              {busy() === "export" ? "exporting…" : "export"}
            </button>
            <label class={`kin-button ${styles.fileButton}`}>
              <input
                ref={fileInput}
                type="file"
                accept=".sqlite,.sqlite3,.db,application/vnd.sqlite3,application/x-sqlite3"
                disabled={busy() !== null}
                onChange={importBackup}
              />
              {busy() === "import" ? "importing…" : "import"}
            </label>
          </div>
        </section>

        <Show when={status()}><p class={styles.status} role="status">{status()}</p></Show>
        <Show when={error()}><p class={styles.error} role="alert">{error()}</p></Show>
      </section>
    </main>
  );
}
