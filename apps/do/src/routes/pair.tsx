import { A } from "@solidjs/router";
import { Show, createMemo, createSignal, onMount } from "solid-js";
import { Title } from "@solidjs/meta";
import { QRDisplay } from "~/components/DevicePairing";
import {
  buildPairingHash,
  buildPairingUrl,
  clearPairingHash,
  parseVaultKeyFromHash,
} from "~/lib/pairing";
import { initializeSync } from "~/lib/sync";
import {
  createVault,
  initializeVaultStore,
  joinVault,
  vaultState,
} from "~/stores/vaultStore";

type BusyAction = "create" | "join" | "copy" | null;

export default function PairPage() {
  const [busyAction, setBusyAction] = createSignal<BusyAction>(null);
  const [currentOrigin, setCurrentOrigin] = createSignal("");
  const [detectedHash, setDetectedHash] = createSignal<string | null>(null);
  const [pendingVaultKey, setPendingVaultKey] = createSignal<string | null>(null);
  const [errorMessage, setErrorMessage] = createSignal<string | null>(null);
  const [copyMessage, setCopyMessage] = createSignal<string | null>(null);

  onMount(async () => {
    await initializeVaultStore();
    setCurrentOrigin(window.location.origin);
    setDetectedHash(window.location.hash || null);
    setPendingVaultKey(parseVaultKeyFromHash(window.location.hash));
  });

  const joinUrl = createMemo(() => {
    if (!vaultState.vaultKey || !currentOrigin()) {
      return null;
    }

    return buildPairingUrl(currentOrigin(), vaultState.vaultKey);
  });

  const joinHash = createMemo(() => {
    if (!vaultState.vaultKey) {
      return null;
    }

    return buildPairingHash(vaultState.vaultKey);
  });

  const isSameVault = createMemo(() => {
    return Boolean(
      pendingVaultKey() &&
      vaultState.vaultKey &&
      pendingVaultKey() === vaultState.vaultKey
    );
  });

  const canReplaceCurrentVault = createMemo(() => {
    return Boolean(pendingVaultKey() && vaultState.isPaired && !isSameVault());
  });

  const handleCreateVault = async () => {
    setBusyAction("create");
    setErrorMessage(null);

    try {
      await createVault();
      await initializeSync();
    } catch (err) {
      setErrorMessage(err instanceof Error ? err.message : "Failed to create vault");
    } finally {
      setBusyAction(null);
    }
  };

  const handleJoinVault = async () => {
    const vaultKey = pendingVaultKey();

    if (!vaultKey) {
      return;
    }

    if (canReplaceCurrentVault()) {
      const shouldReplace = window.confirm(
        "This device is already paired with a different vault. Replace the current vault on this device?"
      );

      if (!shouldReplace) {
        return;
      }
    }

    setBusyAction("join");
    setErrorMessage(null);

    try {
      await joinVault(vaultKey);
      clearPairingHash();
      setDetectedHash(null);
      setPendingVaultKey(null);
      await initializeSync();
      window.location.href = "/";
    } catch (err) {
      setErrorMessage(err instanceof Error ? err.message : "Failed to join vault");
    } finally {
      setBusyAction(null);
    }
  };

  const handleCopyLink = async () => {
    if (!joinUrl()) {
      return;
    }

    setBusyAction("copy");
    setCopyMessage(null);

    try {
      await navigator.clipboard.writeText(joinUrl()!);
      setCopyMessage("LINK COPIED SUCCESSFULLY.");
    } catch {
      setCopyMessage("COPY FAILED. YOU CAN MANUALLY COPY FROM THE INPUT FIELD.");
    } finally {
      setBusyAction(null);
    }
  };

  return (
    <div class="min-h-screen flex flex-col font-mono text-[var(--fg-default)] bg-[var(--bg-canvas)]">
      <Title>pair · do.tildom</Title>

      {/* TUI Navigation Header */}
      <header class="tui-topbar">
        <div class="tui-brand">
          <span class="tui-logo">~</span>
          <span class="tui-title">do.tildom</span>
        </div>
        <nav class="tui-nav">
          <A href="/" end>[ tasks.db ]</A>
          <A href="/settings">[ settings.json ]</A>
          <A href="/pair">[ pair.conf ]</A>
        </nav>
      </header>

      {/* Device Pairing Grid Panel */}
      <div class="tui-container max-w-xl mx-auto flex-1 gap-6 pb-20">
        
        {/* Vault link detected notifications */}
        <Show when={pendingVaultKey()}>
          <section class="border border-[var(--border-color)] bg-[var(--bg-surface)] p-5 flex flex-col gap-4 font-mono">
            <h2 class="tui-heading">■ Vault Secret Detected</h2>
            <div class="flex flex-col gap-2">
              <Show when={isSameVault()}>
                <p class="text-sm">
                  THIS DEVICE IS ALREADY PAIRED TO THIS VAULT LINK.
                </p>
              </Show>
              <Show when={!isSameVault() && !canReplaceCurrentVault()}>
                <p class="text-sm">
                  SECRET DETECTED IN URL HASH. CHOOSE "JOIN" TO PAIR DIRECTLY.
                </p>
              </Show>
              <Show when={canReplaceCurrentVault()}>
                <p class="text-sm text-[var(--syntax-error)] font-bold">
                  ! THIS DEVICE IS LINKED WITH ANOTHER VAULT. JOINING WILL OVERWRITE IT.
                </p>
              </Show>
              <code class="break-all border border-[var(--border-color)] bg-[var(--bg-canvas)] p-3 text-xs block font-mono text-[var(--syntax-string)] mt-2">
                {detectedHash() || buildPairingHash(pendingVaultKey()!)}
              </code>
              <div class="flex gap-3 mt-2">
                <Show when={!isSameVault()}>
                  <button
                    type="button"
                    onClick={handleJoinVault}
                    disabled={busyAction() === "join"}
                    class="tui-button font-mono text-xs px-4 py-2"
                  >
                    {busyAction() === "join"
                      ? "[ JOINING... ]"
                      : canReplaceCurrentVault()
                        ? "[ OVERWRITE & JOIN ]"
                        : "[ JOIN VAULT ]"}
                  </button>
                </Show>
                <button
                  type="button"
                  onClick={() => {
                    clearPairingHash();
                    setDetectedHash(null);
                    setPendingVaultKey(null);
                  }}
                  class="tui-button font-mono text-xs px-4 py-2 border-[var(--border-color)] text-[var(--fg-muted)] hover:border-[var(--fg-default)]"
                >
                  [ DISMISS ]
                </button>
              </div>
            </div>
          </section>
        </Show>

        {/* First time pairing creation block */}
        <Show when={!vaultState.isPaired}>
          <section class="border border-[var(--border-color)] bg-[var(--bg-surface)] p-5 flex flex-col gap-4 font-mono">
            <h2 class="tui-heading">■ Start Vault Pairing</h2>
            <div class="flex flex-col gap-2">
              <p class="text-xs text-[var(--fg-muted)] uppercase mb-3">
                GENERATE A NEW SECURE STORAGE ENVELOPE TO ENABLE MULTI-DEVICE SYNCHRONIZATION.
              </p>
              <button
                type="button"
                onClick={handleCreateVault}
                disabled={busyAction() === "create"}
                class="tui-button w-full"
              >
                {busyAction() === "create" ? "[ SEEDING VAULT ENVELOPE... ]" : "[ CREATE VAULT ]"}
              </button>
            </div>
          </section>
        </Show>

        {/* Sync sharing qr and hash links code */}
        <Show when={vaultState.isPaired && joinUrl()}>
          <section class="border border-[var(--border-color)] bg-[var(--bg-surface)] p-5 flex flex-col gap-4 font-mono">
            <h2 class="tui-heading text-center">■ Share Vault pairing</h2>
            <p class="text-xs text-[var(--fg-muted)] text-center uppercase mb-3">
              SCAN QR OR COPY LINK TO ENROLL NEW END-TO-END ENCRYPTED PAIRED DEVICES.
            </p>

            <QRDisplay joinUrl={joinUrl()!} />

            <div class="flex flex-col gap-3 font-mono">
              <label class="text-xs font-bold text-[var(--fg-muted)] uppercase">
                Pairing URL endpoint
              </label>
              <input
                readOnly
                value={joinUrl()!}
                class="tui-input text-xs font-mono select-all bg-[var(--bg-canvas)]"
              />
              <button
                type="button"
                onClick={handleCopyLink}
                disabled={busyAction() === "copy"}
                class="tui-button w-full"
              >
                {busyAction() === "copy" ? "[ COPYING... ]" : "[ COPY JOIN LINK ]"}
              </button>
              <Show when={copyMessage()}>
                <p class="text-xs text-[var(--syntax-string)] font-bold text-center mt-1 uppercase">{copyMessage()}</p>
              </Show>
            </div>

            <div class="flex flex-col gap-2 mt-4 pt-4 border-t border-dashed border-[var(--border-color)] font-mono">
              <h3 class="text-xs font-bold text-[var(--fg-muted)] uppercase">
                Vault Hash Secret
              </h3>
              <code class="break-all border border-[var(--border-color)] bg-[var(--bg-canvas)] p-3 text-xs block font-mono text-[var(--syntax-string)]">
                {joinHash()}
              </code>
            </div>
          </section>
        </Show>

        {/* Error messaging log block */}
        <Show when={errorMessage()}>
          <div class="border border-[var(--syntax-error)] bg-[var(--bg-canvas)] px-4 py-3 text-xs text-[var(--syntax-error)] font-bold uppercase font-mono">
            {`! ERROR: ${errorMessage()}`}
          </div>
        </Show>

        {/* Explanation and guidelines panel */}
        <section class="border border-[var(--border-color)] bg-[var(--bg-canvas)] p-5 font-mono">
          <div class="flex flex-col gap-3 text-xs">
            <h3 class="font-bold text-[var(--fg-default)] uppercase">■ VAULT ARCHITECTURE REFERENCE</h3>
            <p>
              PAIRED DEVICES USE CLIENT-SIDE CRYPTOGRAPHIC ENVELOPES (AES-GCM) PERSISTED ON INDEXEDDB. NO PLAIN-TEXT LEAKS TO CLOUDFLARE R2 PROXIES.
            </p>
            <p>
              THE VAULT KEY IS KEPT LOCALLY AND INCLUDED EXCLUSIVELY WITHIN THE URL HASH FRACTION (#VAULT=...), SO IT NEVER TOUCHES HOSTING SERVERS.
            </p>
          </div>
        </section>
      </div>
    </div>
  );
}
