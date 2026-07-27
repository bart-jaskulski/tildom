import { Title } from "@solidjs/meta";
import { Show, createMemo, createSignal, onMount } from "solid-js";
import { createPreferences, showVimHelp } from "@tildom/ui";
import { buildPairingUrl, clearPairingHash, parsePairingSecret } from "@tildom/sync-client";
import Button from "~/components/Button";
import buttonStyles from "~/components/Button.module.css";
import QRDisplay from "~/components/DevicePairing/QRDisplay";
import TextButton from "~/components/TextButton";
import { client } from "~/lib/db";
import { pwaInstall } from "~/lib/pwaInstall";
import { createSyncVault, disconnectSync, joinSyncVault, refreshSyncState, syncNow, syncSignals } from "~/lib/syncClient";
import { markSyncDirty } from "~/lib/syncState";
import { getSyncConfig } from "~/lib/syncState";
import { isEntryStoreReady } from "~/stores/entryStore";
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
      const bytes = await client.exportDatabase();
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
      await client.importDatabase(new Uint8Array(await file.arrayBuffer()));
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
      await client.deleteDatabaseFile();
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
    <>
      <Title>Settings | mark.tildom</Title>
      <section class={styles.panel}>
        <Show when={pwaInstall.available() || pwaInstall.needsSafariInstructions()}>
          <section class={styles.section}>
            <h1 class={styles.sectionTitle}>App</h1>
            <Show when={pwaInstall.available()}>
              <Button type="button" onClick={() => void pwaInstall.prompt()}>install mark</Button>
            </Show>
            <Show when={!pwaInstall.available() && pwaInstall.needsSafariInstructions()}>
              <Button type="button" aria-expanded={showInstallHelp()} onClick={() => setShowInstallHelp(!showInstallHelp)}>add to home screen</Button>
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
          <p class={styles.optionDescription}>Wide screens with a hardware keyboard. <TextButton type="button" inline class={styles.optionDescriptionButton} onClick={() => showVimHelp()}>view keybinds <kbd>?</kbd></TextButton></p>
        </section>

        <section class={styles.section}>
          <h2 class={styles.sectionTitle}>Sync</h2>
          <Show when={joinSecret()}>
            <div class={styles.syncBlock}>
              <p class="hn-muted">Pairing will replace this device with the latest remote snapshot.</p>
              <Button type="button" disabled={!isEntryStoreReady() || syncBusy()} onClick={joinVault}>{syncBusy() ? "joining..." : "join vault"}</Button>
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
            <Button type="button" disabled={!isEntryStoreReady() || syncBusy()} onClick={() => void runSync(createSyncVault)}>{syncBusy() ? "creating..." : "create sync vault"}</Button>
          </Show>
          <Show when={syncSignals.isReady() && syncSignals.isPaired()}>
            <dl class={styles.syncStatus}>
              <div><dt>state</dt><dd>{syncSignals.statusText()}</dd></div>
              <div><dt>revision</dt><dd>{revision()}</dd></div>
              <div><dt>local</dt><dd>{syncSignals.hasLocalChanges() ? "pending changes" : "clean"}</dd></div>
            </dl>
            <div class={styles.actions}>
              <Button type="button" disabled={!isEntryStoreReady() || syncBusy()} onClick={() => void runSync(syncNow)}>{syncBusy() ? "syncing..." : "sync now"}</Button>
              <Button type="button" disabled={syncBusy() || !pairUrl()} onClick={() => void runSync(() => navigator.clipboard.writeText(pairUrl()))}>copy pair link</Button>
              <Button type="button" danger disabled={syncBusy()} onClick={() => void runSync(disconnectSync)}>disconnect</Button>
            </div>
            <TextButton type="button" aria-expanded={showQr()} onClick={() => setShowQr(!showQr())}>{showQr() ? "hide pairing QR" : "show pairing QR"}</TextButton>
            <Show when={showQr() && pairUrl()}><div class={styles.syncQr}><QRDisplay value={pairUrl()} /></div></Show>
          </Show>
        </section>

        <section class={styles.section}>
          <h2 class={styles.sectionTitle}>Database</h2>
          <div class={styles.actions}>
            <Button type="button" onClick={handleExport} disabled={!isEntryStoreReady() || isExporting() || isImporting() || isDestroying()}>{isExporting() ? "exporting..." : "export"}</Button>
            <label class={`${buttonStyles.button} ${styles.fileButton}`}><input ref={fileInput} type="file" accept=".sqlite,.sqlite3,.db,application/vnd.sqlite3,application/x-sqlite3" disabled={!isEntryStoreReady() || isExporting() || isImporting() || isDestroying()} onChange={handleImport} />{isImporting() ? "importing..." : "import"}</label>
          </div>
          <Button type="button" danger disabled={!isEntryStoreReady() || isDestroying()} onClick={() => void destroyLocalDatabase()}>{isDestroying() ? "destroying..." : "destroy local database"}</Button>
        </section>

        <Show when={status()}><p class="hn-status" role="status">{status()}</p></Show>
        <Show when={error()}><p class="hn-error" role="alert">{error()}</p></Show>
      </section>
    </>
  );
}
