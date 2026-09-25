import { connectAppToSuite, registerAppWithSuite } from "@tildom/sync-client";
import { createSignal, onMount, Show } from "solid-js";
import { joinSyncVault } from "../lib/syncClient";
import { getSyncConfig } from "../lib/syncState";
import { initializeContactStore } from "../stores/contactStore";

const brokerOrigin = import.meta.env.VITE_HOME_BASE_URL ?? (import.meta.env.DEV ? "http://localhost:5170" : "https://tildom.app");

export default function SuiteCallback() {
  const [error, setError] = createSignal("");
  onMount(async () => {
    try {
      await initializeContactStore();
      if (location.pathname.endsWith("/register")) await registerAppWithSuite("kin", brokerOrigin, getSyncConfig);
      else await connectAppToSuite("kin", brokerOrigin, getSyncConfig, joinSyncVault);
    } catch (cause) { setError(cause instanceof Error ? cause.message : "Suite connection failed"); }
  });
  return <main class="kin-page"><section class="kin-content"><p>Connecting kin to suite sync…</p><Show when={error()}><p role="alert">{error()}</p></Show></section></main>;
}
