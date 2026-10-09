import AppNav from "~/components/AppNav";
import { createSignal, For, onMount, Show } from "solid-js";
import { Title } from "@solidjs/meta";
import { Button, Dialog, Input, RadioButton } from "@tildom/ui";
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
    if (storageStatus() === "persisted") {
      return "ENABLED";
    }

    if (storageStatus() === "not-persisted") {
      return "NOT GRANTED";
    }

    if (storageStatus() === "checking") {
      return "CHECKING";
    }

    return "UNAVAILABLE";
  };

  const storageDescription = () => {
    if (storageStatus() === "persisted") {
      return "Browser protects local task data from eviction reliably.";
    }

    if (storageStatus() === "not-persisted") {
      return "Local data is saved, but may be evicted by the browser under high disk pressure.";
    }

    if (storageStatus() === "checking") {
      return "Verifying storage durability constraints...";
    }

    return "Browser does not expose persistent storage diagnostic APIs.";
  };

  return (
    <div class="min-h-screen flex flex-col font-mono text-[var(--fg-default)] bg-[var(--bg-canvas)]">
      <Title>settings · do.tildom</Title>

      {/* TUI Navigation Header */}
      <AppNav active="settings" />

      {/* Settings Grid Panel */}
      <div class="tui-container max-w-xl mx-auto flex-1 gap-8 pb-20">
        <Show when={pwaInstall.available() || pwaInstall.needsSafariInstructions()}>
          <section class="border-b border-[var(--border-color)] pb-6">
            <h2 class="tui-heading">Install</h2>
            <Show when={pwaInstall.available()}>
              <Button type="button" onClick={() => void pwaInstall.prompt()}>
                [ INSTALL DO ]
              </Button>
            </Show>
            <Show when={!pwaInstall.available() && pwaInstall.needsSafariInstructions()}>
              <p class="text-[var(--fg-muted)] text-sm">In Safari, use Share → Add to Home Screen.</p>
            </Show>
          </section>
        </Show>
        
        {/* Workspace Preferences Section */}
        <section class="border-b border-[var(--border-color)] pb-6">
          <div class="flex justify-between items-center mb-4">
            <h2 class="tui-heading mb-0">Workspaces</h2>
            <Button
              type="button"
              onClick={() => openWorkspaceEditor()}
            >
              [ + NEW ]
            </Button>
          </div>
          
          <div class="flex flex-col gap-2">
            <For each={workspaces()}>
              {(workspace) => {
                const isSelected = () => selectedWorkspaceId() === workspace.id;
                return (
                  <div class="flex items-center justify-between border border-[var(--border-color)] bg-[var(--bg-surface)] p-3">
                    <div class="min-w-0 font-mono">
                      <span class="text-sm font-bold block truncate">{workspace.name}</span>
                      <Show when={isSelected()}>
                        <span class="text-[var(--fg-muted)] text-xs uppercase">[ ACTIVE WORKSPACE ]</span>
                      </Show>
                    </div>

                    <div class="flex items-center gap-2">
                      <Button
                        type="button"
                        onClick={() => void selectWorkspace(workspace.id)}
                        disabled={isSelected()}
                      >
                        {isSelected() ? "[ ACTIVE ]" : "[ USE ]"}
                      </Button>
                      <Button
                        type="button"
                        onClick={() => openWorkspaceEditor(workspace.id, workspace.name)}
                      >
                        [ RENAME ]
                      </Button>
                    </div>
                  </div>
                );
              }}
            </For>
          </div>
        </section>

        {/* Sync & Encryption Section */}
        <section class="border-b border-[var(--border-color)] pb-6 flex flex-col gap-4">
          <h2 class="tui-heading">Sync & Pairing</h2>

          <div class="flex justify-between items-center border border-[var(--border-color)] bg-[var(--bg-surface)] p-3">
            <div>
              <span class="text-sm font-bold block uppercase">Device pairing</span>
              <span class="text-[var(--fg-muted)] text-xs block mt-1">
                {syncSignals.isPaired()
                  ? "DEVICE LINKED. ENCRYPTED SNAPSHOT SYNC ENABLED."
                  : "NOT PAIRED. ENCRYPTED SYNC INACTIVE."}
              </span>
            </div>
            <Button href="/pair">
              {syncSignals.isPaired() ? "[ MANAGE ]" : "[ LINK ]"}
            </Button>
          </div>

          <Show when={syncSignals.isPaired()}>
            <div class="border border-[var(--border-color)] bg-[var(--bg-surface)] p-3 flex flex-col gap-2 font-mono text-sm">
              <div class="flex justify-between items-center">
                <span class="text-[var(--fg-muted)] uppercase text-xs">Revision:</span>
                <code class="text-xs bg-[var(--bg-canvas)] px-2 py-0.5 border border-[var(--border-color)] truncate max-w-[200px]">
                  {syncSignals.lastSeenRevision()}
                </code>
              </div>
              <div class="flex justify-between items-center">
                <span class="text-[var(--fg-muted)] uppercase text-xs">Sync status:</span>
                <span class="text-xs font-bold">{getSyncStatus()}</span>
              </div>
              <div class="flex justify-between items-center">
                <span class="text-[var(--fg-muted)] uppercase text-xs">Last revision:</span>
                <span class="text-xs">{formatLastSync()}</span>
              </div>
              
              <div class="flex justify-between items-center pt-2 border-t border-dashed border-[var(--border-color)] mt-2">
                <span class="text-xs text-[var(--fg-muted)]">
                  {isOnline()
                    ? "SYNC ENCRYPTED DATABASE SNAPSHOT."
                    : "LOCAL CHANGES SYNC WHEN CONNECTED."}
                </span>
                <Button
                  type="button"
                  onClick={handleSyncNow}
                  disabled={isSyncing() || !isOnline()}
                >
                  {isSyncing() ? "[ SYNCING... ]" : "[ SYNC NOW ]"}
                </Button>
              </div>
            </div>
          </Show>
        </section>

        {/* Task Breakdown AI Preference */}
        <section class="border-b border-[var(--border-color)] pb-6">
          <h2 class="tui-heading">Task Breakdown</h2>
          <div class="mt-2 font-mono">
            <span class="text-sm font-bold block uppercase">Detail Granularity</span>
            <span class="text-[var(--fg-muted)] text-xs block mb-3">AI subtask generation level.</span>

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
          </div>
        </section>

        {/* Persistent Storage Diagnostic */}
        <section class="pb-6">
          <h2 class="tui-heading">Storage Durability</h2>
          <div class="border border-[var(--border-color)] bg-[var(--bg-surface)] p-3 flex flex-col gap-3 font-mono">
            <div class="flex justify-between items-start gap-4">
              <div class="space-y-1">
                <span class="text-sm font-bold block uppercase">Storage guarantee</span>
                <p class="text-[var(--fg-muted)] text-xs">
                  {storageDescription()}
                </p>
              </div>
              <span class="text-xs font-bold border border-[var(--border-color)] px-2 py-0.5 bg-[var(--bg-canvas)]">
                {storageLabel()}
              </span>
            </div>
            
            <Show when={storageStatus() === "not-persisted"}>
              <Button
                type="button"
                onClick={() => void handleRequestPersistentStorage()}
                disabled={isRequestingStorage()}
              >
                {isRequestingStorage() ? "[ REQUESTING... ]" : "[ ACTIVATE STORAGE PERSISTENCE ]"}
              </Button>
            </Show>
          </div>
        </section>

      </div>
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
