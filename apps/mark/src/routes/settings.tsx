import { Title } from "@solidjs/meta";
import { Show, createMemo, createSignal, onMount } from "solid-js";
import { createPreferences, showVimHelp } from "@tildom/ui";
import AppNav from "~/components/AppNav";
import QRDisplay from "~/components/DevicePairing/QRDisplay";
import { destroyDatabase, exportDatabase, importDatabase } from "~/lib/db";
import { pwaInstall } from "~/lib/pwaInstall";
import { buildPairingUrl, clearPairingHash, parsePairingSecret } from "~/lib/syncCrypto";
import { createSyncVault, disconnectSync, joinSyncVault, refreshSyncState, syncNow, syncSignals } from "~/lib/syncClient";
import { markSyncDirty } from "~/lib/syncState";
import { getSyncConfig } from "~/lib/syncState";
import styles from "./settings.module.css";

const createBackupFilename = () => `mark-tildom-${new Date().toISOString().slice(0, 10)}.sqlite3`;

export default function Settings() {
  const [status, setStatus] = createSignal<string | null>(null);
  const [error, setError] = createSignal<string | null>(null);
  const [isExporting, setIsExporting] = createSignal(false);
  const [isImporting, setIsImporting] = createSignal(false);
  const [isDestroying, setIsDestroying] = createSignal(false);
  const [syncBusy, setSyncBusy] = createSignal(false);
  const [joinSecret, setJoinSecret] = createSignal<string | null>(null);
  const [pairUrl, setPairUrl] = createSignal("");
  const [showQr, setShowQr] = createSignal(false);
  const [showInstallHelp, setShowInstallHelp] = createSignal(false);
  const [prefs, setPrefs] = createPreferences();
  const revision = createMemo(() => syncSignals.lastSeenRevision() ?? "none");
  let fileInput!: HTMLInputElement;

  const refreshPairUrl = async () => {
    const config = await getSyncConfig();
    setPairUrl(config ? buildPairingUrl(window.location.origin, config.secret) : "");
  };

  onMount(() => {
    setJoinSecret(parsePairingSecret(window.location.hash));
    void refreshSyncState();
    void refreshPairUrl();
  });

  const runSync = async (action: () => Promise<unknown>) => {
    setSyncBusy(true);
    setError(null);
    try {
      await action();
      await refreshPairUrl();
    } catch (err) {
      setError(err instanceof Error ? err.message : "Sync action failed");
    } finally {
      setSyncBusy(false);
    }
  };

  const handleExport = async () => {
    setStatus(null); setError(null); setIsExporting(true);
    try {
      const bytes = await exportDatabase();
      const url = URL.createObjectURL(new Blob([new Uint8Array(bytes).buffer], { type: "application/vnd.sqlite3" }));
      Object.assign(document.createElement("a"), { href: url, download: createBackupFilename() }).click();
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
    if (!file) return;
    if (!window.confirm("Import this database backup? It will replace the current local database.")) {
      fileInput.value = "";
      return;
    }
    setStatus(null); setError(null); setIsImporting(true);
    try {
      await importDatabase(new Uint8Array(await file.arrayBuffer()));
      await markSyncDirty();
      setStatus("Database imported.");
    } catch (err) {
      setError(err instanceof Error ? err.message : "Failed to import database");
    } finally {
      setIsImporting(false);
      fileInput.value = "";
    }
  };

  const destroyLocalDatabase = async () => {
    if (!window.confirm("Destroy this device's local database and disconnect sync? This cannot be undone.")) return;
    setIsDestroying(true);
    try {
      await disconnectSync();
      await destroyDatabase();
      window.location.assign("/");
    } catch (err) {
      setError(err instanceof Error ? err.message : "Failed to destroy database");
      setIsDestroying(false);
    }
  };

  const joinVault = () => runSync(async () => {
    const secret = joinSecret();
    if (!secret) throw new Error("Missing pairing secret");
    await joinSyncVault(secret);
    clearPairingHash();
    setJoinSecret(null);
  });

  return (
    <main class="hn-page">
      <Title>Settings | mark.tildom</Title>
      <AppNav active="settings" />
      <section class={`hn-content hn-stack ${styles.panel}`}>
        <Show when={pwaInstall.available() || pwaInstall.needsSafariInstructions()}>
          <section class={styles.section}>
            <h1 class={styles.sectionTitle}>App</h1>
            <Show when={pwaInstall.available()}>
              <button type="button" class="hn-button" onClick={() => void pwaInstall.prompt()}>install mark</button>
            </Show>
            <Show when={!pwaInstall.available() && pwaInstall.needsSafariInstructions()}>
              <button type="button" class="hn-button" aria-expanded={showInstallHelp()} onClick={() => setShowInstallHelp(!showInstallHelp)}>add to home screen</button>
              <Show when={showInstallHelp()}><p class={`hn-muted ${styles.note}`}>In Safari, use Share, then choose <strong>Add to Home Screen</strong>.</p></Show>
            </Show>
          </section>
        </Show>

        <section class={styles.section}>
          <h2 class={styles.sectionTitle}>Keyboard</h2>
          <label class={styles.checkbox}>
            <input type="checkbox" checked={prefs().vimKeys} onChange={() => setPrefs(prev => ({ ...prev, vimKeys: !prev.vimKeys }))} />
            <span class={styles.optionLabel}>{prefs().vimKeys ? "[x]" : "[ ]"} enable Vim keys</span>
          </label>
          <p class={styles.optionDescription}>Wide screens with a hardware keyboard. <button type="button" class="hn-link-button" onClick={showVimHelp}>view keybinds <kbd>?</kbd></button></p>
        </section>

        <section class={styles.section}>
          <h2 class={styles.sectionTitle}>Sync</h2>
          <Show when={joinSecret()}>
            <div class={styles.syncBlock}>
              <p class="hn-muted">Pairing will replace this device with the latest remote snapshot.</p>
              <button type="button" class="hn-button" disabled={syncBusy()} onClick={joinVault}>{syncBusy() ? "joining..." : "join vault"}</button>
            </div>
          </Show>
          <Show when={!syncSignals.isReady()}>
            <dl class={`${styles.syncStatus} ${styles.syncStatusLoading}`} aria-busy="true">
              <div><dt>state</dt><dd><span /></dd></div>
              <div><dt>revision</dt><dd><span /></dd></div>
              <div><dt>local</dt><dd><span /></dd></div>
            </dl>
          </Show>
          <Show when={syncSignals.isReady() && !syncSignals.isPaired() && !joinSecret()}>
            <button type="button" class="hn-button" disabled={syncBusy()} onClick={() => void runSync(createSyncVault)}>{syncBusy() ? "creating..." : "create sync vault"}</button>
          </Show>
          <Show when={syncSignals.isReady() && syncSignals.isPaired()}>
            <dl class={styles.syncStatus}>
              <div><dt>state</dt><dd>{syncSignals.statusText()}</dd></div>
              <div><dt>revision</dt><dd>{revision()}</dd></div>
              <div><dt>local</dt><dd>{syncSignals.hasLocalChanges() ? "pending changes" : "clean"}</dd></div>
            </dl>
            <div class={styles.actions}>
              <button type="button" class="hn-button" disabled={syncBusy()} onClick={() => void runSync(syncNow)}>{syncBusy() ? "syncing..." : "sync now"}</button>
              <button type="button" class="hn-button" disabled={syncBusy() || !pairUrl()} onClick={() => void runSync(() => navigator.clipboard.writeText(pairUrl()))}>copy pair link</button>
              <button type="button" class="hn-button hn-danger-button" disabled={syncBusy()} onClick={() => void runSync(disconnectSync)}>disconnect</button>
            </div>
            <button type="button" class="hn-link-button" aria-expanded={showQr()} onClick={() => setShowQr(!showQr())}>{showQr() ? "hide pairing QR" : "show pairing QR"}</button>
            <Show when={showQr() && pairUrl()}><div class={styles.syncQr}><QRDisplay value={pairUrl()} /></div></Show>
          </Show>
        </section>

        <section class={styles.section}>
          <h2 class={styles.sectionTitle}>Database</h2>
          <div class={styles.actions}>
            <button type="button" class="hn-button" onClick={handleExport} disabled={isExporting() || isImporting() || isDestroying()}>{isExporting() ? "exporting..." : "export"}</button>
            <label class={`hn-button ${styles.fileButton}`}><input ref={fileInput} type="file" accept=".sqlite,.sqlite3,.db,application/vnd.sqlite3,application/x-sqlite3" disabled={isExporting() || isImporting() || isDestroying()} onChange={handleImport} />{isImporting() ? "importing..." : "import"}</label>
          </div>
          <button type="button" class="hn-button hn-danger-button" disabled={isDestroying()} onClick={() => void destroyLocalDatabase()}>{isDestroying() ? "destroying..." : "destroy local database"}</button>
        </section>

        <Show when={status()}><p class="hn-status" role="status">{status()}</p></Show>
        <Show when={error()}><p class="hn-error" role="alert">{error()}</p></Show>
      </section>
    </main>
  );
}
