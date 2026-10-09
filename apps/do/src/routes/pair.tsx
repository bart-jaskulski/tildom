import AppNav from "~/components/AppNav";
import { Show, createSignal, onMount } from "solid-js";
import { Title } from "@solidjs/meta";
import { Button, ConfirmDialog, Input } from "@tildom/ui";
import { buildPairingUrl, clearPairingHash, parsePairingSecret } from "@tildom/sync-client";
import { QRDisplay } from "~/components/DevicePairing";
import { createSyncVault, disconnectSync, initializeSync, joinSyncVault, syncSignals } from "~/lib/sync";
import { syncState } from "~/lib/syncState";

export default function PairPage() {
  const [pendingSecret, setPendingSecret] = createSignal<string | null>(null);
  const [joinUrl, setJoinUrl] = createSignal("");
  const [confirmJoin, setConfirmJoin] = createSignal(false);
  const [busy, setBusy] = createSignal(false);
  const [message, setMessage] = createSignal("");

  const refreshLink = async () => {
    const config = await syncState.getSyncConfig();
    setJoinUrl(config ? buildPairingUrl(window.location.origin, config.secret) : "");
  };

  onMount(async () => {
    setPendingSecret(parsePairingSecret(window.location.hash));
    if (new URLSearchParams(window.location.hash.slice(1)).has("vault")) {
      setMessage("This link uses the previous pairing format. Create a new sync vault on the device with your tasks, then share its new link. Your local tasks are unchanged.");
      clearPairingHash();
    }
    await initializeSync();
    await refreshLink();
  });

  const run = async (action: () => Promise<unknown>) => {
    setBusy(true);
    setMessage("");
    try {
      await action();
      await refreshLink();
    } catch (error) {
      setMessage(error instanceof Error ? error.message : "Pairing failed");
    } finally {
      setBusy(false);
    }
  };

  const join = async () => {
    const secret = pendingSecret();
    if (!secret) return;
    await joinSyncVault(secret);
    clearPairingHash();
    setPendingSecret(null);
    setConfirmJoin(false);
  };

  return (
    <div class="min-h-screen flex flex-col">
      <Title>pair · do.tildom</Title>
      <AppNav active="pair" />
      <main class="tui-container max-w-xl mx-auto gap-6 pb-20">
        <h1 class="tui-heading">Sync & pairing</h1>
        <p>Your tasks stay on this device. Pairing adds encrypted snapshot sync.</p>
        <Show when={pendingSecret()}>
          <p>A pairing link is ready. Joining replaces local tasks with its snapshot.</p>
          <Button disabled={busy()} onClick={() => setConfirmJoin(true)}>Join paired device</Button>
        </Show>
        <Show when={!syncSignals.isPaired()}>
          <p>Previously paired devices need a new link. Existing local tasks and previous pairing credentials are kept.</p>
          <Button disabled={busy()} onClick={() => void run(createSyncVault)}>Create sync vault</Button>
        </Show>
        <Show when={joinUrl()}>
          <QRDisplay joinUrl={joinUrl()} />
          <label for="pair-link">Pairing link</label>
          <Input id="pair-link" readOnly value={joinUrl()} />
          <Button disabled={busy()} onClick={() => void run(async () => {
            await navigator.clipboard.writeText(joinUrl());
            setMessage("Link copied. Keep it private: it grants access to your tasks.");
          })}>Copy pairing link</Button>
          <Button disabled={busy()} onClick={() => void run(disconnectSync)}>Disconnect this device</Button>
        </Show>
        <Show when={message()}><p role="status">{message()}</p></Show>
        <Show when={syncSignals.status() === "error"}><p role="alert">{syncSignals.statusText()}</p></Show>
      </main>
      <ConfirmDialog
        open={confirmJoin()}
        title="Join paired device?"
        message="Joining replaces this device's task database with the paired device's snapshot."
        confirmText="join"
        isBusy={busy()}
        onConfirm={() => run(join)}
        onCancel={() => { if (!busy()) setConfirmJoin(false); }}
      />
    </div>
  );
}
