import AppNav from "~/components/AppNav";
import { createSignal, For, onMount, Show } from "solid-js";
import { Title } from "@solidjs/meta";
import {
  Button,
  Dialog,
  Input,
  RadioButton,
  SettingsContainer,
  SettingsSection,
  SettingsRow,
  SettingsActions,
} from "@tildom/ui";
import { syncSignals, syncNow } from "~/lib/sync";
import { isOnline } from "~/stores/networkStore";
import {
  breakdownGranularity,
  BREAKDOWN_GRANULARITY_OPTIONS,
  setBreakdownGranularity,
} from "~/stores/preferencesStore";
import {
  createSpace,
  renameSpace,
  selectedSpaceId,
  selectSpace,
  spaces,
} from "~/stores/taskStore";
import { pwaInstall } from "~/lib/pwaInstall";

type StorageStatus = "checking" | "persisted" | "not-persisted" | "unavailable";

export default function SettingsPage() {
  const [isSyncing, setIsSyncing] = createSignal(false);
  const [storageStatus, setStorageStatus] = createSignal<StorageStatus>("checking");
  const [isRequestingStorage, setIsRequestingStorage] = createSignal(false);

  const refreshStorageStatus = async () => {
    if (typeof navigator === "undefined" || !navigator.storage?.persisted) {
      setStorageStatus("unavailable");
      return;
    }

    try {
      const persisted = await navigator.storage.persisted();
      setStorageStatus(persisted ? "persisted" : "not-persisted");
    } catch (error) {
      console.warn("Failed to read persistent storage status:", error);
      setStorageStatus("unavailable");
    }
  };

  onMount(async () => {
    await refreshStorageStatus();
  });

  const [spaceEditor, setSpaceEditor] = createSignal<{ id: string | null } | null>(null);
  const [spaceName, setSpaceName] = createSignal("");
  const [savingSpace, setSavingSpace] = createSignal(false);
  const [spaceError, setSpaceError] = createSignal("");

  const openSpaceEditor = (id: string | null = null, name = "") => {
    setSpaceName(name);
    setSpaceError("");
    setSpaceEditor({ id });
  };

  const saveSpace = async (event: SubmitEvent) => {
    event.preventDefault();
    const editor = spaceEditor();
    const name = spaceName().trim();
    if (!editor || !name || savingSpace()) return;
    setSavingSpace(true);
    setSpaceError("");
    try {
      if (editor.id) await renameSpace(editor.id, name);
      else await createSpace(name);
      setSpaceEditor(null);
    } catch (error) {
      setSpaceError(error instanceof Error ? error.message : "Could not save space");
    } finally {
      setSavingSpace(false);
    }
  };

  const handleSyncNow = async () => {
    setIsSyncing(true);
    try {
      await syncNow();
    } catch (error) {
      console.error("Sync failed:", error);
    } finally {
      setIsSyncing(false);
    }
  };

  const getSyncStatus = () => {
    if (!syncSignals.isPaired()) return "OFFLINE";
    if (syncSignals.status() === "syncing" || isSyncing()) return "SYNCING";
    if (syncSignals.status() === "error") return syncSignals.statusText();
    if (syncSignals.lastSeenRevision()) return "SYNCED";
    return "IDLE";
  };

  const formatLastSync = () => {
    if (!syncSignals.lastSeenRevision()) return "NEVER";
    return syncSignals.lastSeenRevision();
  };

  const handleRequestPersistentStorage = async () => {
    if (typeof navigator === "undefined" || !navigator.storage?.persist) {
      setStorageStatus("unavailable");
      return;
    }

    setIsRequestingStorage(true);

    try {
      await navigator.storage.persist();
      await refreshStorageStatus();
    } catch (error) {
      console.warn("Failed to request persistent storage:", error);
      await refreshStorageStatus();
    } finally {
      setIsRequestingStorage(false);
    }
  };

  const storageLabel = () => {
    if (storageStatus() === "persisted") return "ENABLED";
    if (storageStatus() === "not-persisted") return "NOT GRANTED";
    if (storageStatus() === "checking") return "CHECKING";
    return "UNAVAILABLE";
  };

  return (
    <div class="do-page">
      <Title>settings · do.tildom</Title>
      <AppNav active="settings" />

      <SettingsContainer>
        <Show when={pwaInstall.available() || pwaInstall.needsSafariInstructions()}>
          <SettingsSection title="app">
            <SettingsRow label="install">
              <Show when={pwaInstall.available()}>
                <Button type="button" bracket onClick={() => void pwaInstall.prompt()}>
                  install do
                </Button>
              </Show>
              <Show when={!pwaInstall.available() && pwaInstall.needsSafariInstructions()}>
                <span class="settings-status-text">In Safari, use Share → Add to Home Screen.</span>
              </Show>
            </SettingsRow>
          </SettingsSection>
        </Show>

        {/* Space Section */}
        <SettingsSection title="spaces">
          <SettingsRow label="actions">
            <Button
              type="button"
              bracket
              onClick={() => openSpaceEditor()}
            >
              + NEW
            </Button>
          </SettingsRow>

          <div class="space-list">
            <For each={spaces()}>
              {(space) => {
                const isSelected = () => selectedSpaceId() === space.id;
                return (
                  <div class="space-item">
                    <div class="space-info">
                      <span class="space-name">{space.name}</span>
                      <Show when={isSelected()}>
                        <span class="space-active-badge">[ ACTIVE ]</span>
                      </Show>
                    </div>

                    <div class="space-actions">
                      <Button
                        type="button"
                        bracket
                        onClick={() => void selectSpace(space.id)}
                        disabled={isSelected()}
                      >
                        {isSelected() ? "active" : "use"}
                      </Button>
                      <Button
                        type="button"
                        bracket
                        onClick={() => openSpaceEditor(space.id, space.name)}
                      >
                        rename
                      </Button>
                    </div>
                  </div>
                );
              }}
            </For>
          </div>
        </SettingsSection>

        {/* Task Breakdown AI Preference */}
        <SettingsSection title="task breakdown">
          <SettingsRow label="granularity" hint="AI subtask detail">
            <div class="settings-radio-group">
              <For each={BREAKDOWN_GRANULARITY_OPTIONS}>
                {(level) => (
                  <RadioButton
                    name="breakdown-granularity"
                    checked={breakdownGranularity() === level}
                    onChange={() => setBreakdownGranularity(level)}
                    label={level}
                  />
                )}
              </For>
            </div>
          </SettingsRow>
        </SettingsSection>

        {/* Sync & Encryption Section */}
        <SettingsSection title="sync">
          <SettingsRow label="status">
            <span class="settings-status-text">
              {syncSignals.isPaired()
                ? `${getSyncStatus()} · rev ${formatLastSync()}`
                : "unpaired · local only"}
            </span>
          </SettingsRow>
          <SettingsRow label="actions">
            <SettingsActions>
              <Button href="/pair" bracket>
                {syncSignals.isPaired() ? "manage pair" : "pair device"}
              </Button>
              <Show when={syncSignals.isPaired()}>
                <Button
                  type="button"
                  bracket
                  onClick={handleSyncNow}
                  disabled={isSyncing() || !isOnline()}
                >
                  {isSyncing() ? "syncing..." : "sync now"}
                </Button>
              </Show>
            </SettingsActions>
          </SettingsRow>
        </SettingsSection>

        {/* Persistent Storage Diagnostic */}
        <SettingsSection title="storage">
          <SettingsRow label="durability">
            <div class="space-actions">
              <span class="storage-badge">
                {storageLabel()}
              </span>
              <Show when={storageStatus() === "not-persisted"}>
                <Button
                  type="button"
                  bracket
                  onClick={() => void handleRequestPersistentStorage()}
                  disabled={isRequestingStorage()}
                >
                  {isRequestingStorage() ? "requesting..." : "request persistence"}
                </Button>
              </Show>
            </div>
          </SettingsRow>
        </SettingsSection>
      </SettingsContainer>

      <Dialog
        open={spaceEditor() !== null}
        title={spaceEditor()?.id ? "Rename space" : "New space"}
        onClose={() => { if (!savingSpace()) setSpaceEditor(null); }}
      >
        <form onSubmit={saveSpace}>
          <label for="space-name">Space name</label>
          <Input
            id="space-name"
            required
            autofocus
            value={spaceName()}
            onInput={(event) => setSpaceName(event.currentTarget.value)}
          />
          <Show when={spaceError()}><p role="alert">{spaceError()}</p></Show>
          <Button type="submit" disabled={savingSpace() || !spaceName().trim()}>
            {savingSpace() ? "Saving…" : "Save space"}
          </Button>
        </form>
      </Dialog>
    </div>
  );
}
