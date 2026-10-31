import { onCleanup, onMount, Show } from "solid-js";
import { Button, Tabline } from "@tildom/ui";
import {
  biometricError,
  isBiometricBusy,
  unlockWithBiometrics,
} from "~/lib/biometrics";
import styles from "./LockScreen.module.css";

export default function LockScreen() {
  const handleKeyDown = (event: KeyboardEvent) => {
    if (event.key === "Enter" && !isBiometricBusy()) {
      event.preventDefault();
      void unlockWithBiometrics();
    }
  };

  onMount(() => {
    window.addEventListener("keydown", handleKeyDown);
    onCleanup(() => window.removeEventListener("keydown", handleKeyDown));
    void unlockWithBiometrics(true);
  });

  return (
    <main class="kin-page">
      <Tabline>
        <Tabline.Brand app="kin" />
        <Tabline.Nav>
          <span class={styles.lockedTag}>[ locked ]</span>
        </Tabline.Nav>
      </Tabline>
      <section class="kin-content">
        <div class={styles.panel}>
          <h1 class={styles.title}>kin is locked</h1>
          <p class={styles.description}>
            Use Touch ID, Face ID, or your device passcode to access personal context.
          </p>
          <Show when={biometricError()}>
            <p class={styles.error} role="alert">{biometricError()}</p>
          </Show>
          <div class={styles.actions}>
            <Button
              type="button"
              bracket
              disabled={isBiometricBusy()}
              onClick={() => void unlockWithBiometrics()}
            >
              {isBiometricBusy() ? "verifying…" : "unlock kin"}
            </Button>
          </div>
        </div>
      </section>
    </main>
  );
}
