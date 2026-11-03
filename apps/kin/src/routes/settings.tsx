import {
  Checkbox,
  DatabaseSettings,
  Input,
  Select,
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
import { contacts } from "~/stores/contactStore";
import {
  reminderSettings,
  reminderStatus,
  reminderError,
  isPushSupported,
  isIosNonStandalone,
  enableReminders,
  disableReminders,
  updateReminderConfig,
} from "~/lib/pushClient";
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

  const handleReminderToggle = async (checked: boolean) => {
    if (checked) {
      await enableReminders(contacts());
    } else {
      await disableReminders();
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

        <SettingsSection title="reminders">
          <SettingsRow
            label="birthdays"
            hint={
              isIosNonStandalone()
                ? "add kin to home screen to enable notifications"
                : isPushSupported()
                ? "blind knock delivery via push service"
                : "push notifications unavailable in this browser"
            }
          >
            <Checkbox
              checked={reminderSettings().enabled}
              disabled={!isPushSupported() || isIosNonStandalone()}
              onChange={(checked) => void handleReminderToggle(checked)}
              label="birthday notifications"
            />
          </SettingsRow>

          <Show when={reminderSettings().enabled}>
            <SettingsRow label="advance" hint="how far before the birthday to notify">
              <Select
                value={String(reminderSettings().advanceDays)}
                onChange={(e) => void updateReminderConfig({ advanceDays: Number(e.currentTarget.value) }, contacts())}
              >
                <option value="0">on the day</option>
                <option value="1">1 day before</option>
                <option value="3">3 days before</option>
              </Select>
            </SettingsRow>

            <SettingsRow label="knock time" hint="local time to emit notification">
              <Input
                type="time"
                value={reminderSettings().time}
                onChange={(e) => void updateReminderConfig({ time: e.currentTarget.value || "09:00" }, contacts())}
              />
            </SettingsRow>
          </Show>

          <Show when={reminderStatus()}>
            <div class={styles.settingStatus}>{reminderStatus()}</div>
          </Show>
          <Show when={reminderError()}>
            <div class={styles.settingError} role="alert">{reminderError()}</div>
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
