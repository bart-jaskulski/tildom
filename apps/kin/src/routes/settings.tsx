import {
  Checkbox,
  DatabaseSettings,
  SettingsContainer,
  SettingsRow,
  SettingsSection,
  SyncSettings,
  SystemSettings,
  createPreferences,
} from "@tildom/ui";
import { Show } from "solid-js";
import AppNav from "~/components/AppNav";
import { db } from "~/lib/db";
import { pwaInstall } from "~/lib/pwaInstall";
import {
  biometricError,
  disableBiometric,
  enableBiometric,
  isBiometricBusy,
  isBiometricEnabled,
  isBiometricSupported,
} from "~/lib/biometrics";
import {
  createSyncVault,
  disconnectSync,
  joinSyncVault,
  refreshSyncState,
  syncNow,
  syncSignals,
} from "~/lib/syncClient";
import { getSyncConfig, markSyncDirty } from "~/lib/syncState";
import styles from "./settings.module.css";

export default function Settings() {
  const [preferences, setPreferences] = createPreferences();

  const handleImport = async () => {
    await markSyncDirty();
  };

  const handleReset = async () => {
    await disconnectSync();
    window.location.assign("/");
  };

  const handleBiometricToggle = async (checked: boolean) => {
    if (checked) {
      await enableBiometric();
    } else {
      await disableBiometric();
    }
  };

  return (
    <main class="kin-page">
      <AppNav active="settings" />
      <SettingsContainer>
        <SystemSettings
          vimKeys={preferences().vimKeys}
          onVimKeysChange={(vimKeys) => setPreferences((current) => ({ ...current, vimKeys }))}
          pwaInstall={pwaInstall}
          appName="kin"
        />

        <SettingsSection title="privacy">
          <SettingsRow
            label="biometric"
            hint={isBiometricSupported() ? "locks after 5 min idle" : "platform authenticator unavailable"}
          >
            <Checkbox
              checked={isBiometricEnabled()}
              disabled={!isBiometricSupported() || isBiometricBusy()}
              onChange={(checked) => void handleBiometricToggle(checked)}
              label="biometric unlock"
            />
          </SettingsRow>
          <Show when={biometricError()}>
            <div class={styles.settingError} role="alert">{biometricError()}</div>
          </Show>
        </SettingsSection>

        <SyncSettings
          signals={syncSignals}
          onSyncNow={syncNow}
          onCreateVault={createSyncVault}
          onJoinVault={joinSyncVault}
          onDisconnect={disconnectSync}
          onRefresh={refreshSyncState}
          getSyncConfig={getSyncConfig}
        />

        <DatabaseSettings
          client={db}
          filenamePrefix="kin"
          onImport={handleImport}
          onReset={handleReset}
        />
      </SettingsContainer>
    </main>
  );
}
