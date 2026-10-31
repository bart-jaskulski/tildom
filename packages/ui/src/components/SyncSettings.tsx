import { JSX, Show, createMemo, createSignal, onMount, splitProps } from "solid-js";
import { buildPairingUrl, clearPairingHash, parsePairingSecret } from "@tildom/sync-client";
import Button from "./Button";
import Dialog from "./Dialog";
import QRDisplay from "./QRDisplay";
import { SettingsSection, SettingsRow, SettingsActions } from "./Settings";
import styles from "./SyncSettings.module.css";

export interface SyncSignals {
  isReady: () => boolean;
  isPaired: () => boolean;
  statusText?: () => string;
  lastSeenRevision?: () => string | null;
  hasLocalChanges?: () => boolean;
}

export interface SyncSettingsProps extends JSX.HTMLAttributes<HTMLElement> {
  signals: SyncSignals;
  onSyncNow: () => Promise<unknown>;
  onCreateVault?: () => Promise<unknown>;
  onJoinVault?: (secret: string) => Promise<unknown>;
  onDisconnect?: () => Promise<unknown>;
  onRefresh?: () => Promise<unknown>;
  getSyncConfig?: () => Promise<{ secret: string } | null | undefined>;
  getPairUrl?: () => Promise<string> | string;
  ready?: boolean;
}

export default function SyncSettings(props: SyncSettingsProps) {
  const [local, others] = splitProps(props, [
    "signals",
    "onSyncNow",
    "onCreateVault",
    "onJoinVault",
    "onDisconnect",
    "onRefresh",
    "getSyncConfig",
    "getPairUrl",
    "ready",
    "class",
  ]);

  const [busy, setBusy] = createSignal(false);
  const [busyAction, setBusyAction] = createSignal<string | null>(null);
  const [error, setError] = createSignal<string | null>(null);
  const [joinSecret, setJoinSecret] = createSignal<string | null>(null);
  const [pairUrl, setPairUrl] = createSignal("");
  const [showPair, setShowPair] = createSignal(false);
  const [copied, setCopied] = createSignal(false);

  const isReady = () => (local.ready ?? true) && local.signals.isReady();
  const revision = createMemo(() => local.signals.lastSeenRevision?.() ?? "none");
  const statusSummary = createMemo(() => {
    if (!local.signals.isReady()) return "loading sync state...";
    if (!local.signals.isPaired()) return "unpaired · local only";
    const text = local.signals.statusText?.() ?? "synced";
    const rev = revision();
    const changes = local.signals.hasLocalChanges?.() ? "pending changes" : "clean";
    return `${text} · rev ${rev} · ${changes}`;
  });

  const refreshPairUrl = async () => {
    if (local.getPairUrl) {
      setPairUrl(await local.getPairUrl());
      return;
    }
    if (local.getSyncConfig && typeof window !== "undefined") {
      const config = await local.getSyncConfig();
      setPairUrl(config ? buildPairingUrl(window.location.origin, config.secret) : "");
    }
  };

  onMount(() => {
    if (typeof window !== "undefined") {
      const secret = parsePairingSecret(window.location.hash);
      if (secret) setJoinSecret(secret);
    }
    void local.onRefresh?.();
    void refreshPairUrl();
  });

  const run = async (name: string, action: () => Promise<unknown>) => {
    setBusy(true);
    setBusyAction(name);
    setError(null);
    try {
      await action();
      await refreshPairUrl();
    } catch (err) {
      setError(err instanceof Error ? err.message : "Sync action failed");
    } finally {
      setBusy(false);
      setBusyAction(null);
    }
  };

  const handleJoin = () => {
    const secret = joinSecret();
    if (!secret || !local.onJoinVault) return;
    run("joining", async () => {
      await local.onJoinVault!(secret);
      clearPairingHash();
      setJoinSecret(null);
    });
  };

  const handleCancelJoin = () => {
    clearPairingHash();
    setJoinSecret(null);
  };

  const handleCopyPairUrl = async () => {
    const url = pairUrl();
    if (!url || typeof navigator === "undefined") return;
    try {
      if (navigator.clipboard?.writeText) {
        await navigator.clipboard.writeText(url);
        setCopied(true);
        setTimeout(() => setCopied(false), 2000);
        return;
      }
      throw new Error("Clipboard unavailable");
    } catch {
      try {
        const textarea = document.getElementById("pair-link-url") as HTMLTextAreaElement | null;
        if (textarea) {
          textarea.focus();
          textarea.select();
          if (document.execCommand("copy")) {
            setCopied(true);
            setTimeout(() => setCopied(false), 2000);
            return;
          }
        }
      } catch {
        // fallback failed
      }
      setError("Failed to copy pairing link");
    }
  };

  const handleDisconnect = () => {
    if (!local.onDisconnect) return;
    if (!window.confirm("Disconnect sync? Local data will remain on this device.")) return;
    run("disconnecting", async () => {
      await local.onDisconnect!();
      setShowPair(false);
      setPairUrl("");
    });
  };

  return (
    <SettingsSection title="sync" class={local.class} {...others}>
      <Show when={joinSecret()}>
        <SettingsRow label="incoming">
          <span class={styles.statusText}>pairing secret detected</span>
        </SettingsRow>
        <SettingsRow label="actions">
          <SettingsActions>
            <Button
              type="button"
              bracket
              disabled={!isReady() || busy()}
              onClick={handleJoin}
            >
              {busyAction() === "joining" ? "joining..." : "join vault"}
            </Button>
            <Button
              type="button"
              bracket
              disabled={busy()}
              onClick={handleCancelJoin}
            >
              cancel
            </Button>
          </SettingsActions>
        </SettingsRow>
      </Show>

      <Show when={!joinSecret()}>
        <SettingsRow label="status">
          <span class={`${styles.statusText} ${!local.signals.isPaired() ? styles.statusMuted : ""}`}>
            {statusSummary()}
          </span>
        </SettingsRow>

        <SettingsRow label="actions">
          <SettingsActions>
            <Show when={!local.signals.isPaired() && local.onCreateVault}>
              <Button
                type="button"
                bracket
                disabled={!isReady() || busy()}
                onClick={() => run("creating", local.onCreateVault!)}
              >
                {busyAction() === "creating" ? "creating..." : "create sync vault"}
              </Button>
            </Show>

            <Show when={local.signals.isPaired()}>
              <Button
                type="button"
                bracket
                disabled={!isReady() || busy()}
                onClick={() => run("syncing", local.onSyncNow)}
              >
                {busyAction() === "syncing" ? "syncing..." : "sync now"}
              </Button>

              <Button
                type="button"
                bracket
                disabled={busy()}
                aria-expanded={showPair()}
                onClick={() => setShowPair(true)}
              >
                pair device
              </Button>

              <Show when={local.onDisconnect}>
                <Button
                  type="button"
                  danger
                  bracket
                  disabled={busy()}
                  onClick={handleDisconnect}
                >
                  {busyAction() === "disconnecting" ? "disconnecting..." : "disconnect"}
                </Button>
              </Show>
            </Show>
          </SettingsActions>
        </SettingsRow>

        <Dialog
          open={showPair() && local.signals.isPaired()}
          onClose={() => setShowPair(false)}
          title="pair device"
          hideCloseButton
        >
          <div class={styles.pairDialog}>
            <Show when={pairUrl()}>
              <div class={styles.qrContainer}>
                <QRDisplay value={pairUrl()} size={190} />
              </div>

              <textarea
                id="pair-link-url"
                rows={2}
                readOnly
                value={pairUrl()}
                class={styles.pairUrlInput}
                aria-label="Pairing link"
                onFocus={(e) => e.currentTarget.select()}
              />
            </Show>

            <div class={styles.dialogActions}>
              <Button
                type="button"
                bracket
                variant="text"
                onClick={() => setShowPair(false)}
              >
                close
              </Button>
              <Button
                type="button"
                bracket
                disabled={!pairUrl()}
                onClick={handleCopyPairUrl}
              >
                {copied() ? "copied" : "copy link"}
              </Button>
            </div>
          </div>
        </Dialog>
      </Show>

      <Show when={error()}>
        <p class={styles.error} role="alert">{error()}</p>
      </Show>
    </SettingsSection>
  );
}
