import { createSignal, onMount, Show } from "solid-js";
import { base64UrlEncode, createSuiteKeyringClient } from "@tildom/sync-client";
import {
  clearSuiteSession, createSuite, getSuiteSession, hasPasskey, openSuite, protectWithPasskey,
  startSuiteSession, syncBaseUrl, unlockWithPasskey,
} from "./suite";

const APPS = ["mark", "kin", "hey", "list"] as const;
const DEV_PORTS: Record<string, number> = { mark: 5173, kin: 5174, hey: 5175, list: 5176 };
const TX_KEY = "tildom-suite-transaction";
const appOrigin = (app: string) => import.meta.env.DEV
  ? `http://localhost:${DEV_PORTS[app]}`
  : `https://${app}.tildom.app`;

type Transaction = { state: string; app: string; operation: "register" | "connect" };
const randomState = () => base64UrlEncode(crypto.getRandomValues(new Uint8Array(24)));

export default function SuitePage() {
  const [recoveryKey, setRecoveryKey] = createSignal(getSuiteSession() ?? "");
  const [input, setInput] = createSignal("");
  const [status, setStatus] = createSignal("");
  const [error, setError] = createSignal("");
  const [busy, setBusy] = createSignal(false);
  const [protectedByPasskey, setProtectedByPasskey] = createSignal(false);

  const run = async (action: () => Promise<void>) => {
    setBusy(true); setError(""); setStatus("");
    try { await action(); } catch (cause) { setError(cause instanceof Error ? cause.message : "Suite sync failed"); }
    finally { setBusy(false); }
  };

  const consumeCallback = async () => {
    const values = new URLSearchParams(location.hash.slice(1));
    const tx = JSON.parse(sessionStorage.getItem(TX_KEY) ?? "null") as Transaction | null;
    if (!tx || values.get("state") !== tx.state || values.get("app") !== tx.app) return;
    history.replaceState(history.state, "", location.pathname);
    try {
      const key = getSuiteSession();
      if (!key) throw new Error("Suite session expired; unlock and try again");
      if (tx.operation === "register") {
        const secret = values.get("secret");
        if (!secret) throw new Error("App did not return its sync secret");
        await (await createSuiteKeyringClient(key, syncBaseUrl)).registerAppSecret(tx.app, secret);
        setStatus(`${tx.app} was added to suite recovery.`);
      } else {
        setStatus(`${tx.app} is connected to suite sync.`);
      }
    } finally {
      sessionStorage.removeItem(TX_KEY);
    }
  };

  onMount(() => void run(async () => {
    setProtectedByPasskey(await hasPasskey());
    await consumeCallback();
  }));

  const begin = (app: string, operation: Transaction["operation"], secret?: string) => {
    const state = randomState();
    sessionStorage.setItem(TX_KEY, JSON.stringify({ state, app, operation } satisfies Transaction));
    const hash = new URLSearchParams({ state, ...(secret ? { secret } : {}) });
    location.assign(`${appOrigin(app)}/suite/${operation}#${hash}`);
  };

  const register = (app: string) => begin(app, "register");
  const connect = (app: string) => void run(async () => {
    const key = recoveryKey();
    if (!key) throw new Error("Unlock suite recovery first");
    const secret = await (await createSuiteKeyringClient(key, syncBaseUrl)).resolveAppSecret(app);
    begin(app, "connect", secret);
  });

  const download = () => {
    const url = URL.createObjectURL(new Blob([`${recoveryKey()}\n`], { type: "text/plain" }));
    Object.assign(document.createElement("a"), { href: url, download: "tildom-recovery-key.txt" }).click();
    URL.revokeObjectURL(url);
  };

  return <div class="suite-shell">
    <header class="topline"><a class="wordmark" href="/">tildom</a><span class="tab">[ suite.sync ]</span></header>
    <main class="suite-main">
      <section class="suite-panel">
        <h1>Suite sync</h1>
        <p class="intro">One recovery key reconnects each isolated Tildom app.</p>

        <Show when={!recoveryKey()}>
          <div class="suite-actions">
            <button disabled={busy()} onClick={() => void run(async () => { const key = await createSuite(); setRecoveryKey(key); setStatus("Suite recovery created. Save the recovery key now."); })}>[ create suite recovery ]</button>
            <label>recovery key<input value={input()} onInput={(event) => setInput(event.currentTarget.value)} /></label>
            <label>recovery key file<input type="file" accept=".txt,text/plain" onChange={(event) => {
              const file = event.currentTarget.files?.[0];
              if (file) void file.text().then(setInput).catch(() => setError("Could not read recovery key file"));
            }} /></label>
            <button disabled={busy() || !input()} onClick={() => void run(async () => { const key = await openSuite(input()); setRecoveryKey(key); setStatus("Suite recovery unlocked."); })}>[ recover suite ]</button>
            <Show when={protectedByPasskey()}><button disabled={busy()} onClick={() => void run(async () => { const key = await unlockWithPasskey(); startSuiteSession(key); setRecoveryKey(key); setStatus("Suite recovery unlocked with passkey."); })}>[ unlock with passkey ]</button></Show>
          </div>
        </Show>

        <Show when={recoveryKey()}>
          <section class="suite-section">
            <h2>Recovery key</h2>
            <input class="recovery-key" readOnly value={recoveryKey()} />
            <div class="suite-actions inline">
              <button onClick={() => void navigator.clipboard.writeText(recoveryKey())}>[ copy ]</button>
              <button onClick={download}>[ download ]</button>
              <Show when={!protectedByPasskey()}><button disabled={busy()} onClick={() => void run(async () => { await protectWithPasskey(recoveryKey()); setProtectedByPasskey(true); setStatus("Suite key protected with a passkey."); })}>[ protect with passkey ]</button></Show>
              <button onClick={() => { clearSuiteSession(); setRecoveryKey(""); setStatus("Suite recovery locked."); }}>[ lock ]</button>
            </div>
          </section>
          <section class="suite-section">
            <h2>Applications</h2>
            <p>Register preserves an existing vault. Connect restores or creates the suite-derived vault.</p>
            <ul class="suite-apps">{APPS.map((app) => <li><strong>{app}</strong><span><button onClick={() => register(app)}>[ register existing ]</button><button onClick={() => connect(app)}>[ connect ]</button></span></li>)}</ul>
          </section>
        </Show>
        <Show when={status()}><p role="status" class="suite-status">{status()}</p></Show>
        <Show when={error()}><p role="alert" class="suite-error">{error()}</p></Show>
      </section>
    </main>
  </div>;
}
