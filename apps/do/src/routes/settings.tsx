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
  createWorkspace,
  renameWorkspace,
  selectedWorkspaceId,
  selectWorkspace,
  workspaces,
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

  const [workspaceEditor, setWorkspaceEditor] = createSignal<{ id: string | null } | null>(null);
  const [workspaceName, setWorkspaceName] = createSignal("");
  const [savingWorkspace, setSavingWorkspace] = createSignal(false);
  const [workspaceError, setWorkspaceError] = createSignal("");

  const openWorkspaceEditor = (id: string | null = null, name = "") => {
    setWorkspaceName(name);
    setWorkspaceError("");
    setWorkspaceEditor({ id });
  };

  const saveWorkspace = async (event: SubmitEvent) => {
    event.preventDefault();
    const editor = workspaceEditor();
    const name = workspaceName().trim();
    if (!editor || !name || savingWorkspace()) return;
    setSavingWorkspace(true);
    setWorkspaceError("");
    try {
      if (editor.id) await renameWorkspace(editor.id, name);
      else await createWorkspace(name);
      setWorkspaceEditor(null);
    } catch (error) {
      setWorkspaceError(error instanceof Error ? error.message : "Could not save workspace");
    } finally {
      setSavingWorkspace(false);
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
    <div class="min-h-screen flex flex-col font-mono text-fg bg-canvas">
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
                <span class="text-muted text-sm">In Safari, use Share → Add to Home Screen.</span>
              </Show>
            </SettingsRow>
          </SettingsSection>
        </Show>

        {/* Workspace Section */}
        <SettingsSection title="workspaces">
          <SettingsRow label="actions">
            <Button
              type="button"
              bracket
              onClick={() => openWorkspaceEditor()}
            >
              + NEW
            </Button>
          </SettingsRow>

          <div class="flex flex-col gap-2 w-full mt-2">
            <For each={workspaces()}>
              {(workspace) => {
                const isSelected = () => selectedWorkspaceId() === workspace.id;
                return (
                  <div class="flex items-center justify-between border border-border bg-surface p-2">
                    <div class="min-w-0 font-mono">
                      <span class="text-sm font-bold block truncate">{workspace.name}</span>
                      <Show when={isSelected()}>
                        <span class="text-muted text-xs uppercase">[ ACTIVE ]</span>
                      </Show>
                    </div>

                    <div class="flex items-center gap-2">
                      <Button
                        type="button"
                        bracket
                        onClick={() => void selectWorkspace(workspace.id)}
                        disabled={isSelected()}
                      >
                        {isSelected() ? "active" : "use"}
                      </Button>
                      <Button
                        type="button"
                        bracket
                        onClick={() => openWorkspaceEditor(workspace.id, workspace.name)}
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
            <div class="flex gap-4">
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
            <span class="text-sm">
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
            <div class="flex items-center gap-3">
              <span class="text-xs font-bold border border-border px-2 py-0.5 bg-canvas">
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
        open={workspaceEditor() !== null}
        title={workspaceEditor()?.id ? "Rename workspace" : "New workspace"}
        onClose={() => { if (!savingWorkspace()) setWorkspaceEditor(null); }}
      >
        <form onSubmit={saveWorkspace}>
          <label for="workspace-name">Workspace name</label>
          <Input
            id="workspace-name"
            required
            autofocus
            value={workspaceName()}
            onInput={(event) => setWorkspaceName(event.currentTarget.value)}
          />
          <Show when={workspaceError()}><p role="alert">{workspaceError()}</p></Show>
          <Button type="submit" disabled={savingWorkspace() || !workspaceName().trim()}>
            {savingWorkspace() ? "Saving…" : "Save workspace"}
          </Button>
        </form>
      </Dialog>
    </div>
  );
}
