import QRCode from "qrcode";
import { Show, createEffect, createMemo, createSignal, onMount } from "solid-js";
import { buildPairingUrl, clearPairingHash, parsePairingSecret } from "@tildom/sync-client";
import { createSyncVault, disconnectSync, joinSyncVault, refreshSyncState, syncNow, syncSignals } from "~/lib/syncClient";
import { getSyncConfig } from "~/lib/syncState";
import styles from "./SyncSettings.module.css";

export default function SyncSettings() {
  const [busy, setBusy] = createSignal(false);
  const [error, setError] = createSignal<string | null>(null);
  const [joinSecret, setJoinSecret] = createSignal<string | null>(null);
  const [pairUrl, setPairUrl] = createSignal("");
  const [showQr, setShowQr] = createSignal(false);
  const [qrDataUrl, setQrDataUrl] = createSignal("");
  const [qrError, setQrError] = createSignal<string | null>(null);
  const revision = createMemo(() => syncSignals.lastSeenRevision() ?? "none");

  createEffect(() => {
    const value = pairUrl();
    if (!showQr() || !value) return;
    setQrDataUrl("");
    setQrError(null);
    void QRCode.toDataURL(value, {
      width: 280,
      margin: 2,
      color: { dark: "#24292e", light: "#ffffff" },
    }).then(setQrDataUrl).catch((cause) => {
      setQrError(cause instanceof Error ? cause.message : "Failed to generate QR code");
    });
  });

  const refreshPairUrl = async () => {
    const config = await getSyncConfig();
    setPairUrl(config ? buildPairingUrl(window.location.origin, config.secret) : "");
  };
  const run = async (action: () => Promise<unknown>) => {
    setBusy(true); setError(null);
    try { await action(); await refreshPairUrl(); }
    catch (cause) { setError(cause instanceof Error ? cause.message : "Sync action failed"); }
    finally { setBusy(false); }
  };

  onMount(() => {
    setJoinSecret(parsePairingSecret(window.location.hash));
    void refreshSyncState();
    void refreshPairUrl();
  });

  const join = () => run(async () => {
    const secret = joinSecret();
    if (!secret) throw new Error("Missing pairing secret");
    await joinSyncVault(secret);
    clearPairingHash();
    setJoinSecret(null);
  });

  return (
    <section class={styles.section}>
      <h2>Sync</h2>
      <p>Full database snapshots are encrypted on this device before upload.</p>
      <Show when={joinSecret()}>
        <p>Pairing replaces this device with the latest remote snapshot.</p>
        <button type="button" class="kin-button" disabled={busy()} onClick={() => void join()}>{busy() ? "joining…" : "join vault"}</button>
      </Show>
      <Show when={!syncSignals.isReady()}>
        <dl class={`${styles.status} ${styles.loading}`} aria-busy="true">
          <div><dt>state</dt><dd><span /></dd></div>
          <div><dt>revision</dt><dd><span /></dd></div>
          <div><dt>local</dt><dd><span /></dd></div>
        </dl>
      </Show>
      <Show when={syncSignals.isReady() && !syncSignals.isPaired() && !joinSecret()}>
        <button type="button" class="kin-button" disabled={busy()} onClick={() => void run(createSyncVault)}>{busy() ? "creating…" : "create sync vault"}</button>
      </Show>
      <Show when={syncSignals.isReady() && syncSignals.isPaired()}>
        <dl class={styles.status}>
          <div><dt>state</dt><dd>{syncSignals.statusText()}</dd></div>
          <div><dt>revision</dt><dd>{revision()}</dd></div>
          <div><dt>local</dt><dd>{syncSignals.hasLocalChanges() ? "pending changes" : "clean"}</dd></div>
        </dl>
        <div class={styles.actions}>
          <button type="button" class="kin-button" disabled={busy()} onClick={() => void run(syncNow)}>{busy() ? "syncing…" : "sync now"}</button>
          <button type="button" class="kin-button" disabled={busy() || !pairUrl()} onClick={() => void run(() => navigator.clipboard.writeText(pairUrl()))}>copy pair link</button>
          <button type="button" class="kin-button kin-danger-button" disabled={busy()} onClick={() => void run(disconnectSync)}>disconnect</button>
        </div>
        <button type="button" class="kin-link-button" aria-expanded={showQr()} onClick={() => setShowQr(!showQr())}>
          [{showQr() ? "hide pairing QR" : "show pairing QR"}]
        </button>
        <Show when={showQr() && qrDataUrl()}>
          <img class={styles.qr} src={qrDataUrl()} alt="Pairing QR code" />
        </Show>
        <Show when={showQr() && qrError()}><p class={styles.error} role="alert">{qrError()}</p></Show>
      </Show>
      <Show when={error()}><p class={styles.error} role="alert">{error()}</p></Show>
    </section>
  );
}
