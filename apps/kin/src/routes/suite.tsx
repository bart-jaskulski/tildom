import { connectAppToSuite, registerAppWithSuite } from "@tildom/sync-client";
import { ConfirmDialog } from "@tildom/ui";
import { createSignal, onMount, Show } from "solid-js";
import { joinSyncVault } from "../lib/syncClient";
import { getSyncConfig } from "../lib/syncState";
import { initializeContactStore } from "../stores/contactStore";

const brokerOrigin = import.meta.env.VITE_HOME_BASE_URL ?? (import.meta.env.DEV ? "http://localhost:5170" : "https://tildom.app");

export default function SuiteCallback() {
  const [error, setError] = createSignal("");
  const [confirmPrompt, setConfirmPrompt] = createSignal<{
    message: string;
    resolve: (value: boolean) => void;
  } | null>(null);

  const requestConfirm = (message: string) =>
    new Promise<boolean>((resolve) => {
      setConfirmPrompt({ message, resolve });
    });

  onMount(async () => {
    try {
      await initializeContactStore();
      if (location.pathname.endsWith("/register")) await registerAppWithSuite("kin", brokerOrigin, getSyncConfig);
      else await connectAppToSuite("kin", brokerOrigin, getSyncConfig, joinSyncVault, requestConfirm);
    } catch (cause) { setError(cause instanceof Error ? cause.message : "Suite connection failed"); }
  });

  return (
    <main class="kin-page">
      <section class="kin-content">
        <p>Connecting kin to suite sync…</p>
        <Show when={error()}><p role="alert">{error()}</p></Show>
      </section>
      <ConfirmDialog
        open={Boolean(confirmPrompt())}
        title="Connect to suite sync?"
        message={confirmPrompt()?.message}
        confirmText="connect"
        onConfirm={() => {
          confirmPrompt()?.resolve(true);
          setConfirmPrompt(null);
        }}
        onCancel={() => {
          confirmPrompt()?.resolve(false);
          setConfirmPrompt(null);
        }}
      />
    </main>
  );
}
