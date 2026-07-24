import { createSignal, For, onMount, Show } from "solid-js";
import { A } from "@solidjs/router";
import { Title } from "@solidjs/meta";
import { vaultState } from "~/stores/vaultStore";
import { syncStateStore, syncNow } from "~/lib/sync";
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

  const promptForWorkspaceName = (message: string, initialValue = "") => {
    if (typeof window === "undefined") {
      return null;
    }

    const nextName = window.prompt(message, initialValue)?.trim();
    return nextName ? nextName : null;
  };

  const handleCreateWorkspace = async () => {
    const name = promptForWorkspaceName("Name the new workspace");
    if (!name) {
      return;
    }

    await createWorkspace(name);
  };

  const handleRenameWorkspace = async (workspaceId: string, currentName: string) => {
    const nextName = promptForWorkspaceName("Rename workspace", currentName);
    if (!nextName || nextName === currentName) {
      return;
    }

    await renameWorkspace(workspaceId, nextName);
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
    if (!vaultState.isPaired) return "OFFLINE";
    if (syncStateStore.status === "syncing" || isSyncing()) return "SYNCING";
    if (syncStateStore.lastSyncTimestamp) return "SYNCED";
    return "IDLE";
  };

  const formatLastSync = () => {
    if (!syncStateStore.lastSyncTimestamp) return "NEVER";
    const date = new Date(syncStateStore.lastSyncTimestamp);
    return date.toLocaleString().toUpperCase();
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
      <header class="tui-topbar">
        <A href="/" class="tui-brand">
          <img class="tui-logo" src="/icon.svg" alt="" />
          <span class="tui-title">tildom</span>
        </A>
        <nav class="tui-nav">
          <A href="/" end>[ tasks.db ]</A>
          <A href="/settings">[ settings.json ]</A>
          <A href="/pair">[ pair.conf ]</A>
        </nav>
      </header>

      {/* Settings Grid Panel */}
      <div class="tui-container max-w-xl mx-auto flex-1 gap-8 pb-20">
        <Show when={pwaInstall.available() || pwaInstall.needsSafariInstructions()}>
          <section class="border-b border-[var(--border-color)] pb-6">
            <h2 class="tui-heading">■ Install</h2>
            <Show when={pwaInstall.available()}>
              <button type="button" class="tui-button min-h-[44px] px-3 font-mono" onClick={() => void pwaInstall.prompt()}>
                [ INSTALL DO ]
              </button>
            </Show>
            <Show when={!pwaInstall.available() && pwaInstall.needsSafariInstructions()}>
              <p class="text-[var(--fg-muted)] text-sm">In Safari, use Share → Add to Home Screen.</p>
            </Show>
          </section>
        </Show>
        
        {/* Workspace Preferences Section */}
        <section class="border-b border-[var(--border-color)] pb-6">
          <div class="flex justify-between items-center mb-4">
            <h2 class="tui-heading mb-0">■ Workspaces</h2>
            <button
              type="button"
              onClick={() => void handleCreateWorkspace()}
              class="tui-button text-xs min-h-[36px] px-3 py-1 font-mono"
            >
              [ + NEW ]
            </button>
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
                      <button
                        type="button"
                        onClick={() => void selectWorkspace(workspace.id)}
                        disabled={isSelected()}
                        class={`text-xs font-mono border px-2 py-1 transition-colors cursor-pointer ${
                          isSelected()
                            ? "border-[var(--fg-default)] bg-[var(--syntax-bg-active)] text-[var(--fg-default)]"
                            : "border-[var(--border-color)] hover:border-[var(--fg-default)] text-[var(--fg-default)]"
                        }`}
                      >
                        {isSelected() ? "[ ACTIVE ]" : "[ USE ]"}
                      </button>
                      <button
                        type="button"
                        onClick={() => void handleRenameWorkspace(workspace.id, workspace.name)}
                        class="text-xs font-mono border border-[var(--border-color)] hover:border-[var(--fg-default)] px-2 py-1 transition-colors cursor-pointer"
                      >
                        [ RENAME ]
                      </button>
                    </div>
                  </div>
                );
              }}
            </For>
          </div>
        </section>

        {/* Sync & Encryption Section */}
        <section class="border-b border-[var(--border-color)] pb-6 flex flex-col gap-4">
          <h2 class="tui-heading">■ Sync & Pairing</h2>

          <div class="flex justify-between items-center border border-[var(--border-color)] bg-[var(--bg-surface)] p-3">
            <div>
              <span class="text-sm font-bold block uppercase">Device pairing</span>
              <span class="text-[var(--fg-muted)] text-xs block mt-1">
                {vaultState.isPaired
                  ? "DEVICE LINKED. READY TO SYNC CHANGESET ENVELOPES."
                  : "NOT PAIRED. ENCRYPTED SYNC INACTIVE."}
              </span>
            </div>
            <A href="/pair" class="tui-button text-xs min-h-[36px] px-3 py-1 font-mono flex items-center justify-center">
              {vaultState.isPaired ? "[ MANAGE ]" : "[ LINK ]"}
            </A>
          </div>

          <Show when={vaultState.isPaired}>
            <div class="border border-[var(--border-color)] bg-[var(--bg-surface)] p-3 flex flex-col gap-2 font-mono text-sm">
              <div class="flex justify-between items-center">
                <span class="text-[var(--fg-muted)] uppercase text-xs">Device id:</span>
                <code class="text-xs bg-[var(--bg-canvas)] px-2 py-0.5 border border-[var(--border-color)] truncate max-w-[200px]">
                  {vaultState.deviceId}
                </code>
              </div>
              <div class="flex justify-between items-center">
                <span class="text-[var(--fg-muted)] uppercase text-xs">Sync status:</span>
                <span class="text-xs font-bold">{getSyncStatus()}</span>
              </div>
              <div class="flex justify-between items-center">
                <span class="text-[var(--fg-muted)] uppercase text-xs">Last index:</span>
                <span class="text-xs">{formatLastSync()}</span>
              </div>
              
              <div class="flex justify-between items-center pt-2 border-t border-dashed border-[var(--border-color)] mt-2">
                <span class="text-xs text-[var(--fg-muted)]">
                  {isOnline()
                    ? "FORCE LOCAL MERGE TO VAULT ENVELOPE."
                    : "OFFLINE CHANGES QUEUED IN INDEXEDDB."}
                </span>
                <button
                  type="button"
                  class="tui-button text-xs min-h-[36px] px-3 py-1 font-mono"
                  onClick={handleSyncNow}
                  disabled={isSyncing() || !isOnline()}
                >
                  {isSyncing() ? "[ SYNCING... ]" : "[ SYNC NOW ]"}
                </button>
              </div>
            </div>
          </Show>
        </section>

        {/* Task Breakdown AI Preference */}
        <section class="border-b border-[var(--border-color)] pb-6">
          <h2 class="tui-heading">■ Task Breakdown</h2>
          <div class="mt-2 font-mono">
            <span class="text-sm font-bold block uppercase">Detail Granularity</span>
            <span class="text-[var(--fg-muted)] text-xs block mb-3">AI subtask generation level.</span>

            <div class="flex gap-4">
              <For each={BREAKDOWN_GRANULARITY_OPTIONS}>
                {(level) => {
                  const isSelected = () => breakdownGranularity() === level;
                  return (
                    <button
                      type="button"
                      onClick={() => setBreakdownGranularity(level)}
                      class="font-mono text-sm hover:text-[var(--syntax-keyword)] transition-colors cursor-pointer select-none"
                    >
                      {isSelected() ? `(*) ${level.toUpperCase()}` : `( ) ${level.toUpperCase()}`}
                    </button>
                  );
                }}
              </For>
            </div>
          </div>
        </section>

        {/* Persistent Storage Diagnostic */}
        <section class="pb-6">
          <h2 class="tui-heading">■ Storage Durability</h2>
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
              <button
                type="button"
                onClick={() => void handleRequestPersistentStorage()}
                disabled={isRequestingStorage()}
                class="tui-button w-full"
              >
                {isRequestingStorage() ? "[ REQUESTING... ]" : "[ ACTIVATE STORAGE PERSISTENCE ]"}
              </button>
            </Show>
          </div>
        </section>

      </div>
    </div>
  );
}
