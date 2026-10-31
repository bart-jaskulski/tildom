import { JSX, Show, createSignal, splitProps } from "solid-js";
import Button from "./Button";
import ConfirmDialog from "./ConfirmDialog";
import { SettingsSection, SettingsRow, SettingsActions } from "./Settings";
import styles from "./DatabaseSettings.module.css";

export interface DatabaseTarget {
  exportDatabase: () => Promise<Uint8Array | ArrayBuffer>;
  importDatabase: (bytes: Uint8Array) => Promise<void>;
  deleteDatabaseFile?: () => Promise<void>;
}

export interface DatabaseSettingsProps extends JSX.HTMLAttributes<HTMLElement> {
  client: DatabaseTarget;
  filenamePrefix?: string;
  storageLabel?: string;
  ready?: boolean;
  onImport?: () => Promise<void> | void;
  onReset?: () => Promise<void> | void;
}

export default function DatabaseSettings(props: DatabaseSettingsProps) {
  const [local, others] = splitProps(props, [
    "client",
    "filenamePrefix",
    "storageLabel",
    "ready",
    "onImport",
    "onReset",
    "class",
  ]);

  const [status, setStatus] = createSignal<string | null>(null);
  const [error, setError] = createSignal<string | null>(null);
  const [isExporting, setIsExporting] = createSignal(false);
  const [isImporting, setIsImporting] = createSignal(false);
  const [isDestroying, setIsDestroying] = createSignal(false);
  const [showDestroyConfirm, setShowDestroyConfirm] = createSignal(false);
  const [pendingImportFile, setPendingImportFile] = createSignal<File | null>(null);
  let fileInput!: HTMLInputElement;

  const isBusy = () => isExporting() || isImporting() || isDestroying();
  const isReady = () => local.ready ?? true;

  const setTimedStatus = (msg: string) => {
    setStatus(msg);
    setTimeout(() => {
      setStatus((current) => (current === msg ? null : current));
    }, 3000);
  };

  const handleExport = async () => {
    setStatus(null);
    setError(null);
    setIsExporting(true);
    try {
      const bytes = await local.client.exportDatabase();
      const prefix = local.filenamePrefix || "tildom";
      const filename = `${prefix}-${new Date().toISOString().slice(0, 10)}.sqlite3`;
      const blob = new Blob([new Uint8Array(bytes).buffer], { type: "application/vnd.sqlite3" });
      const url = URL.createObjectURL(blob);
      const a = document.createElement("a");
      a.href = url;
      a.download = filename;
      a.click();
      URL.revokeObjectURL(url);
      setTimedStatus("database exported");
    } catch (err) {
      setError(err instanceof Error ? err.message : "Failed to export database");
    } finally {
      setIsExporting(false);
    }
  };

  const handleImport = (event: Event) => {
    const file = (event.currentTarget as HTMLInputElement).files?.[0];
    if (!file) return;
    setPendingImportFile(file);
  };

  const confirmImport = async () => {
    const file = pendingImportFile();
    if (!file) return;
    setStatus(null);
    setError(null);
    setIsImporting(true);
    try {
      const buffer = await file.arrayBuffer();
      await local.client.importDatabase(new Uint8Array(buffer));
      await local.onImport?.();
      setTimedStatus("database imported");
    } catch (err) {
      setError(err instanceof Error ? err.message : "Failed to import database");
    } finally {
      setIsImporting(false);
      setPendingImportFile(null);
      if (fileInput) fileInput.value = "";
    }
  };

  const cancelImport = () => {
    setPendingImportFile(null);
    if (fileInput) fileInput.value = "";
  };

  const confirmDestroy = async () => {
    setStatus(null);
    setError(null);
    setIsDestroying(true);
    try {
      await local.client.deleteDatabaseFile?.();
      setShowDestroyConfirm(false);
      if (local.onReset) {
        await local.onReset();
      } else {
        window.location.assign("/");
      }
    } catch (err) {
      setError(err instanceof Error ? err.message : "Failed to destroy database");
      setIsDestroying(false);
      setShowDestroyConfirm(false);
    }
  };

  return (
    <SettingsSection title="data" class={local.class} {...others}>
      <SettingsRow label="backup">
        <SettingsActions>
          <Button
            type="button"
            bracket
            disabled={!isReady() || isBusy()}
            onClick={handleExport}
          >
            {isExporting() ? "exporting..." : "export"}
          </Button>

          <Button
            as="label"
            bracket
            disabled={!isReady() || isBusy()}
            class={styles.fileButton}
          >
            <input
              ref={fileInput}
              type="file"
              style={{ display: "none" }}
              accept=".sqlite,.sqlite3,.db,application/vnd.sqlite3,application/x-sqlite3"
              disabled={!isReady() || isBusy()}
              onChange={handleImport}
            />
            {isImporting() ? "importing..." : "import"}
          </Button>

          <Show when={local.client.deleteDatabaseFile}>
            <Button
              type="button"
              danger
              bracket
              disabled={!isReady() || isBusy()}
              onClick={() => setShowDestroyConfirm(true)}
            >
              {isDestroying() ? "erasing..." : "erase db"}
            </Button>
          </Show>
        </SettingsActions>
      </SettingsRow>
      <Show when={status()}>
        <p class={styles.status} role="status">{status()}</p>
      </Show>
      <Show when={error()}>
        <p class={styles.error} role="alert">{error()}</p>
      </Show>

      <ConfirmDialog
        open={showDestroyConfirm()}
        title="Destroy database?"
        message="Destroy this device's local database and disconnect sync? This cannot be undone."
        confirmText="erase"
        danger
        isBusy={isDestroying()}
        onConfirm={confirmDestroy}
        onCancel={() => {
          if (!isDestroying()) setShowDestroyConfirm(false);
        }}
      />

      <ConfirmDialog
        open={Boolean(pendingImportFile())}
        title="Import database backup?"
        message="Import this database backup? It will replace the current local database."
        confirmText="import"
        danger
        isBusy={isImporting()}
        onConfirm={confirmImport}
        onCancel={cancelImport}
      />
    </SettingsSection>
  );
}
