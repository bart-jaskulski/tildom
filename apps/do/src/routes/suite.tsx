import { connectAppToSuite, registerAppWithSuite } from "@tildom/sync-client";
import { ConfirmDialog } from "@tildom/ui";
import { createSignal, onMount, Show } from "solid-js";
import { joinSyncVault } from "~/lib/sync";
import { syncState } from "~/lib/syncState";
import { initializeTaskStore } from "~/stores/taskStore";

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
      await initializeTaskStore();
      if (location.pathname.endsWith("/register")) await registerAppWithSuite("do", brokerOrigin, syncState.getSyncConfig);
      else await connectAppToSuite("do", brokerOrigin, syncState.getSyncConfig, joinSyncVault, requestConfirm);
    } catch (cause) { setError(cause instanceof Error ? cause.message : "Suite connection failed"); }
  });

  return (
    <main>
      <p>Connecting do to suite sync…</p>
      <Show when={error()}><p role="alert">{error()}</p></Show>
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
