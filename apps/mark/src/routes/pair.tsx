import { Title } from "@solidjs/meta";
import { A, useNavigate } from "@solidjs/router";
import { Show, createMemo, createSignal, onMount } from "solid-js";
import { createVimNavigation } from "@tildom/ui";
import AppNav from "~/components/AppNav";
import QRDisplay from "~/components/DevicePairing/QRDisplay";
import { buildPairingUrl, clearPairingHash, parsePairingSecret } from "~/lib/syncCrypto";
import {
  createSyncVault,
  disconnectSync,
  joinSyncVault,
  syncNow,
  syncSignals,
} from "~/lib/syncClient";
import { getSyncConfig } from "~/lib/syncState";

export default function Pair() {
  const navigate = useNavigate();
  const [joinSecret, setJoinSecret] = createSignal<string | null>(null);
  const [pairUrl, setPairUrl] = createSignal("");
  const [error, setError] = createSignal<string | null>(null);
  const [busy, setBusy] = createSignal(false);
  const revision = createMemo(() => syncSignals.lastSeenRevision() ?? "none");

  const refreshPairUrl = async () => {
    const config = await getSyncConfig();
    setPairUrl(config ? buildPairingUrl(window.location.origin, config.secret) : "");
  };

  onMount(() => {
    setJoinSecret(parsePairingSecret(window.location.hash));
    void refreshPairUrl();

    createVimNavigation({
      onEscape: () => navigate("/"),
      customCommands: {
        t: (lastKey) => {
          if (lastKey === "g") navigate("/");
        },
        T: (lastKey) => {
          if (lastKey === "g") navigate("/");
        },
        h: () => window.history.back(),
        l: () => window.history.forward(),
      },
    });
  });

  const run = async (action: () => Promise<unknown>) => {
    setBusy(true);
    setError(null);
    try {
      await action();
      await refreshPairUrl();
    } catch (err) {
      setError(err instanceof Error ? err.message : "Sync action failed");
    } finally {
      setBusy(false);
    }
  };

  const createVault = () => run(createSyncVault);

  const joinVault = () => run(async () => {
    const secret = joinSecret();
    if (!secret) {
      throw new Error("Missing pairing secret");
    }

    await joinSyncVault(secret);
    clearPairingHash();
    setJoinSecret(null);
  });

  const manualSync = () => run(syncNow);

  const disconnect = () => run(async () => {
    const confirmed = window.confirm("Disconnect this device from sync? Local data stays on this device.");
    if (confirmed) {
      await disconnectSync();
    }
  });

  const copyPairLink = () => run(async () => {
    await navigator.clipboard.writeText(pairUrl());
  });

  return (
    <main class="hn-page">
      <Title>Sync | mark.tildom</Title>
      <AppNav active="settings" />

      <section class="hn-content hn-stack">
        <div class="hn-panel hn-stack settings-panel">
          <div>
            <h1 class="hn-heading">Sync</h1>
            <p class="hn-muted">Encrypted SQLite snapshots for this Mark vault.</p>
          </div>

          <div class="settings-actions">
            <A href="/settings" class="hn-link-button">back to settings</A>
          </div>

          <Show when={joinSecret()}>
            <div class="sync-block">
              <p class="hn-muted">Pairing link detected. Joining will replace this device with the latest remote snapshot.</p>
              <button type="button" class="hn-button" disabled={busy()} onClick={joinVault}>
                {busy() ? "joining..." : "join vault"}
              </button>
            </div>
          </Show>

          <Show when={!syncSignals.isPaired() && !joinSecret()}>
            <div class="settings-actions">
              <button type="button" class="hn-button" disabled={busy()} onClick={createVault}>
                {busy() ? "creating..." : "create sync vault"}
              </button>
            </div>
          </Show>

          <Show when={syncSignals.isPaired()}>
            <dl class="sync-status">
              <div>
                <dt>state</dt>
                <dd>{syncSignals.statusText()}</dd>
              </div>
              <div>
                <dt>revision</dt>
                <dd>{revision()}</dd>
              </div>
              <div>
                <dt>local</dt>
                <dd>{syncSignals.hasLocalChanges() ? "pending changes" : "clean"}</dd>
              </div>
            </dl>

            <div class="settings-actions">
              <button type="button" class="hn-button" disabled={busy()} onClick={manualSync}>
                {busy() ? "syncing..." : "sync now"}
              </button>
              <button type="button" class="hn-button" disabled={busy() || !pairUrl()} onClick={copyPairLink}>
                copy pair link
              </button>
              <button type="button" class="hn-button" disabled={busy()} onClick={disconnect}>
                disconnect
              </button>
            </div>

            <Show when={pairUrl()}>
              <div class="sync-qr">
                <QRDisplay value={pairUrl()} />
                <p class="hn-muted breakable">{pairUrl()}</p>
              </div>
            </Show>
          </Show>

          <Show when={error()}>
            <p class="hn-error" role="alert">{error()}</p>
          </Show>
        </div>
      </section>
    </main>
  );
}
